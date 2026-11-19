//! 终端内核：把 PTY 输出的字节流解析成字符网格。
//!
//! 这是本项目独立实现的精简 VT 解析器，覆盖日常 shell 交互所需的控制序列：
//! C0 控制符、光标移动、擦除、插入/删除行列、滚动区域、SGR 颜色（16 色 /
//! 256 色 / 真彩）、DECSET 的常用私有模式。**不追求完整 emulation**，
//! 未识别的序列一律跳过而不是报错——终端里"多看一个怪字符"比"整屏乱掉"好。

use std::collections::VecDeque;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Color {
    Default,
    Indexed(u8),
    Rgb(u8, u8, u8),
}

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub struct Attrs {
    pub bold: bool,
    pub dim: bool,
    pub italic: bool,
    pub underline: bool,
    pub reverse: bool,
    pub strike: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Cell {
    pub ch: char,
    /// 宽字符（CJK）的右侧占位格：渲染时跳过
    pub wide_tail: bool,
    pub fg: Color,
    pub bg: Color,
    pub attr: Attrs,
}

impl Cell {
    fn blank() -> Self {
        Cell {
            ch: ' ',
            wide_tail: false,
            fg: Color::Default,
            bg: Color::Default,
            attr: Attrs::default(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Span {
    pub text: String,
    pub fg: Color,
    pub bg: Color,
    pub attr: Attrs,
}

#[derive(Clone, Debug)]
pub struct Row {
    pub spans: Vec<Span>,
}

#[derive(Clone, Copy, PartialEq)]
enum State {
    Ground,
    Esc,
    Csi,
    Osc,
    Charset,
}

pub struct Term {
    pub cols: usize,
    pub rows: usize,
    grid: Vec<Cell>,
    pub cx: usize,
    pub cy: usize,
    pub cursor_visible: bool,
    pub rev: u64,
    pub title: String,
    /// 需要回写给 PTY 的应答（DSR / DA 等查询）。
    ///
    /// 终端不是纯输出设备：shell 与全屏程序会先发 `ESC[6n` 问光标位置，
    /// 收不到回应就一直等。这里把应答攒起来，由上层在读线程里回写。
    pub outbox: Vec<u8>,
    scrollback: VecDeque<Vec<Cell>>,
    scrollback_limit: usize,

    saved: (usize, usize, Color, Color, Attrs),
    fg: Color,
    bg: Color,
    attr: Attrs,
    scroll_top: usize,
    scroll_bottom: usize,

    state: State,
    params: Vec<u16>,
    param: u16,
    has_param: bool,
    private: u8,
    utf8: Vec<u8>,
    wrap_pending: bool,
}

impl Term {
    pub fn new(cols: usize, rows: usize) -> Self {
        let cols = cols.max(2);
        let rows = rows.max(1);
        Term {
            cols,
            rows,
            grid: vec![Cell::blank(); cols * rows],
            cx: 0,
            cy: 0,
            cursor_visible: true,
            rev: 0,
            title: String::new(),
            outbox: Vec::new(),
            scrollback: VecDeque::new(),
            scrollback_limit: 4000,
            saved: (0, 0, Color::Default, Color::Default, Attrs::default()),
            fg: Color::Default,
            bg: Color::Default,
            attr: Attrs::default(),
            scroll_top: 0,
            scroll_bottom: rows - 1,
            state: State::Ground,
            params: Vec::with_capacity(8),
            param: 0,
            has_param: false,
            private: 0,
            utf8: Vec::with_capacity(4),
            wrap_pending: false,
        }
    }

    fn idx(&self, x: usize, y: usize) -> usize {
        y * self.cols + x
    }

    pub fn resize(&mut self, cols: usize, rows: usize) {
        let cols = cols.max(2);
        let rows = rows.max(1);
        if cols == self.cols && rows == self.rows {
            return;
        }
        let mut next = vec![Cell::blank(); cols * rows];
        for y in 0..rows.min(self.rows) {
            for x in 0..cols.min(self.cols) {
                next[y * cols + x] = self.grid[self.idx(x, y)];
            }
        }
        self.grid = next;
        self.cols = cols;
        self.rows = rows;
        self.scroll_top = 0;
        self.scroll_bottom = rows - 1;
        self.cx = self.cx.min(cols - 1);
        self.cy = self.cy.min(rows - 1);
        self.rev += 1;
    }

    fn scroll_up(&mut self, n: usize) {
        for _ in 0..n {
            let top = self.scroll_top;
            let bottom = self.scroll_bottom;
            if top >= bottom {
                return;
            }
            // 主屏顶部滚出屏幕的行进入回滚缓冲
            if top == 0 {
                let line: Vec<Cell> = self.grid[0..self.cols].to_vec();
                if line.iter().any(|c| c.ch != ' ' || c.bg != Color::Default) {
                    self.scrollback.push_back(line);
                    while self.scrollback.len() > self.scrollback_limit {
                        self.scrollback.pop_front();
                    }
                }
            }
            let row_len = self.cols;
            self.grid.copy_within((top + 1) * row_len..(bottom + 1) * row_len, top * row_len);
            for x in 0..row_len {
                let i = bottom * row_len + x;
                self.grid[i] = Cell::blank();
            }
        }
        self.rev += 1;
    }

    fn scroll_down(&mut self, n: usize) {
        for _ in 0..n {
            let top = self.scroll_top;
            let bottom = self.scroll_bottom;
            if top >= bottom {
                return;
            }
            let row_len = self.cols;
            self.grid
                .copy_within(top * row_len..bottom * row_len, (top + 1) * row_len);
            for x in 0..row_len {
                let i = top * row_len + x;
                self.grid[i] = Cell::blank();
            }
        }
        self.rev += 1;
    }

    fn newline(&mut self) {
        if self.cy == self.scroll_bottom {
            self.scroll_up(1);
        } else if self.cy + 1 < self.rows {
            self.cy += 1;
        }
    }

    fn put(&mut self, ch: char) {
        let width = char_width(ch);
        if width == 0 {
            return;
        }
        if self.wrap_pending && self.cx >= self.cols {
            self.cx = 0;
            self.newline();
        }
        if self.cx + width > self.cols {
            self.cx = 0;
            self.newline();
        }
        let i = self.idx(self.cx, self.cy);
        self.grid[i] = Cell {
            ch,
            wide_tail: false,
            fg: self.fg,
            bg: self.bg,
            attr: self.attr,
        };
        if width == 2 && self.cx + 1 < self.cols {
            let j = self.idx(self.cx + 1, self.cy);
            self.grid[j] = Cell {
                ch: ' ',
                wide_tail: true,
                fg: self.fg,
                bg: self.bg,
                attr: self.attr,
            };
        }
        self.cx += width;
        self.wrap_pending = self.cx >= self.cols;
        self.rev += 1;
    }

    fn clear_row(&mut self, y: usize, from: usize, to: usize) {
        for x in from..to.min(self.cols) {
            let i = self.idx(x, y);
            let bg = self.bg;
            self.grid[i] = Cell {
                ch: ' ',
                wide_tail: false,
                fg: Color::Default,
                bg,
                attr: Attrs::default(),
            };
        }
    }

    // ---------------- 字节流解析 ----------------

    pub fn feed(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.byte(b);
        }
    }

    fn byte(&mut self, b: u8) {
        match self.state {
            State::Ground => self.ground(b),
            State::Esc => self.esc(b),
            State::Csi => self.csi(b),
            State::Osc => {
                // OSC 以 BEL 或 ST 结束；标题（0/2）之外的内容忽略
                if b == 0x07 || b == 0x1b {
                    self.state = State::Ground;
                } else if self.title.len() < 120 {
                    // 只保留可读字符，避免把控制字节塞进窗口标题
                    if b >= 0x20 && b < 0x7f {
                        self.title.push(b as char);
                    }
                }
            }
            State::Charset => {
                self.state = State::Ground;
            }
        }
    }

    fn ground(&mut self, b: u8) {
        match b {
            0x1b => {
                self.state = State::Esc;
                self.params.clear();
                self.param = 0;
                self.has_param = false;
                self.private = 0;
            }
            0x0d => {
                self.cx = 0;
                self.wrap_pending = false;
            }
            0x0a | 0x0b | 0x0c => {
                self.wrap_pending = false;
                self.newline();
            }
            0x08 => {
                self.wrap_pending = false;
                if self.cx > 0 {
                    self.cx -= 1;
                }
            }
            0x09 => {
                self.wrap_pending = false;
                let next = ((self.cx / 8) + 1) * 8;
                self.cx = next.min(self.cols - 1);
            }
            0x07 => {}
            b if b < 0x20 => {}
            _ => {
                // UTF-8 解码（含跨 read 边界的半个字符）
                self.utf8.push(b);
                if let Some(ch) = decode_utf8(&self.utf8) {
                    self.utf8.clear();
                    self.put(ch);
                } else if self.utf8.len() >= 4 {
                    self.utf8.clear();
                    self.put('\u{fffd}');
                }
            }
        }
    }

    fn esc(&mut self, b: u8) {
        self.state = State::Ground;
        match b {
            b'[' => {
                self.state = State::Csi;
                self.params.clear();
                self.param = 0;
                self.has_param = false;
                self.private = 0;
            }
            b']' => {
                self.state = State::Osc;
                self.title.clear();
            }
            b'(' | b')' | b'*' | b'+' => self.state = State::Charset,
            b'7' => self.save_cursor(),
            b'8' => self.restore_cursor(),
            b'D' => {
                self.wrap_pending = false;
                self.newline();
            }
            b'E' => {
                self.cx = 0;
                self.wrap_pending = false;
                self.newline();
            }
            b'M' => {
                if self.cy == self.scroll_top {
                    self.scroll_down(1);
                } else if self.cy > 0 {
                    self.cy -= 1;
                }
            }
            b'c' => self.reset(),
            _ => {}
        }
    }

    fn save_cursor(&mut self) {
        self.saved = (self.cx, self.cy, self.fg, self.bg, self.attr);
    }

    fn restore_cursor(&mut self) {
        let (x, y, fg, bg, attr) = self.saved;
        self.cx = x.min(self.cols - 1);
        self.cy = y.min(self.rows - 1);
        self.fg = fg;
        self.bg = bg;
        self.attr = attr;
    }

    fn reset(&mut self) {
        for c in self.grid.iter_mut() {
            *c = Cell::blank();
        }
        self.cx = 0;
        self.cy = 0;
        self.fg = Color::Default;
        self.bg = Color::Default;
        self.attr = Attrs::default();
        self.scroll_top = 0;
        self.scroll_bottom = self.rows - 1;
        self.cursor_visible = true;
    }

    fn csi(&mut self, b: u8) {
        match b {
            b'0'..=b'9' => {
                self.param = self.param.saturating_mul(10).saturating_add((b - b'0') as u16);
                self.has_param = true;
            }
            b';' => {
                self.params.push(self.param);
                self.param = 0;
                self.has_param = false;
            }
            b'?' | b'>' | b'=' | b'!' => {
                self.private = b;
            }
            b' ' => {}
            0x40..=0x7e => {
                if self.has_param || !self.params.is_empty() {
                    self.params.push(self.param);
                }
                self.dispatch(b);
                self.state = State::Ground;
            }
            0x20..=0x2f => {}
            _ => {
                // 非法字节：放弃这条序列，避免吞掉后续正常输出
                self.state = State::Ground;
            }
        }
    }

    fn p(&self, i: usize, def: usize) -> usize {
        match self.params.get(i) {
            Some(&0) | None => def,
            Some(&v) => v as usize,
        }
    }

    fn p0(&self, i: usize) -> usize {
        self.params.get(i).copied().unwrap_or(0) as usize
    }

    fn dispatch(&mut self, f: u8) {
        match f {
            b'A' => {
                let n = self.p(0, 1);
                self.cy = self.cy.saturating_sub(n).max(self.scroll_top);
                self.wrap_pending = false;
            }
            b'B' => {
                let n = self.p(0, 1);
                self.cy = (self.cy + n).min(self.scroll_bottom);
                self.wrap_pending = false;
            }
            b'C' => {
                let n = self.p(0, 1);
                self.cx = (self.cx + n).min(self.cols - 1);
                self.wrap_pending = false;
            }
            b'D' => {
                let n = self.p(0, 1);
                self.cx = self.cx.saturating_sub(n);
                self.wrap_pending = false;
            }
            b'E' => {
                let n = self.p(0, 1);
                self.cx = 0;
                self.cy = (self.cy + n).min(self.rows - 1);
                self.wrap_pending = false;
            }
            b'F' => {
                let n = self.p(0, 1);
                self.cx = 0;
                self.cy = self.cy.saturating_sub(n);
                self.wrap_pending = false;
            }
            b'G' | b'`' => {
                let n = self.p(0, 1);
                self.cx = (n - 1).min(self.cols - 1);
                self.wrap_pending = false;
            }
            b'd' => {
                let n = self.p(0, 1);
                self.cy = (n - 1).min(self.rows - 1);
                self.wrap_pending = false;
            }
            b'H' | b'f' => {
                let y = self.p(0, 1);
                let x = self.p(1, 1);
                self.cy = (y - 1).min(self.rows - 1);
                self.cx = (x - 1).min(self.cols - 1);
                self.wrap_pending = false;
            }
            b'J' => {
                let mode = self.p0(0);
                match mode {
                    0 => {
                        self.clear_row(self.cy, self.cx, self.cols);
                        for y in self.cy + 1..self.rows {
                            self.clear_row(y, 0, self.cols);
                        }
                    }
                    1 => {
                        for y in 0..self.cy {
                            self.clear_row(y, 0, self.cols);
                        }
                        self.clear_row(self.cy, 0, self.cx + 1);
                    }
                    _ => {
                        for y in 0..self.rows {
                            self.clear_row(y, 0, self.cols);
                        }
                        if mode == 3 {
                            self.scrollback.clear();
                        }
                    }
                }
                self.rev += 1;
            }
            b'K' => {
                let mode = self.p0(0);
                match mode {
                    0 => self.clear_row(self.cy, self.cx, self.cols),
                    1 => self.clear_row(self.cy, 0, self.cx + 1),
                    _ => self.clear_row(self.cy, 0, self.cols),
                }
                self.rev += 1;
            }
            b'X' => {
                let n = self.p(0, 1);
                self.clear_row(self.cy, self.cx, self.cx + n);
                self.rev += 1;
            }
            b'P' => {
                let n = self.p(0, 1);
                let row = self.cy;
                for x in self.cx..self.cols {
                    let src = x + n;
                    let cell = if src < self.cols {
                        self.grid[self.idx(src, row)]
                    } else {
                        Cell::blank()
                    };
                    let i = self.idx(x, row);
                    self.grid[i] = cell;
                }
                self.rev += 1;
            }
            b'@' => {
                let n = self.p(0, 1);
                let row = self.cy;
                for x in (self.cx..self.cols).rev() {
                    let cell = if x >= self.cx + n {
                        self.grid[self.idx(x - n, row)]
                    } else {
                        Cell::blank()
                    };
                    let i = self.idx(x, row);
                    self.grid[i] = cell;
                }
                self.rev += 1;
            }
            b'L' => {
                if self.cy >= self.scroll_top && self.cy <= self.scroll_bottom {
                    let n = self.p(0, 1);
                    let (top, bottom) = (self.cy, self.scroll_bottom);
                    for _ in 0..n {
                        self.grid
                            .copy_within(top * self.cols..bottom * self.cols, (top + 1) * self.cols);
                        for x in 0..self.cols {
                            self.grid[top * self.cols + x] = Cell::blank();
                        }
                    }
                    self.rev += 1;
                }
            }
            b'M' => {
                if self.cy >= self.scroll_top && self.cy <= self.scroll_bottom {
                    let n = self.p(0, 1);
                    let (top, bottom) = (self.cy, self.scroll_bottom);
                    for _ in 0..n {
                        self.grid.copy_within(
                            (top + 1) * self.cols..(bottom + 1) * self.cols,
                            top * self.cols,
                        );
                        for x in 0..self.cols {
                            self.grid[bottom * self.cols + x] = Cell::blank();
                        }
                    }
                    self.rev += 1;
                }
            }
            b'S' => self.scroll_up(self.p(0, 1)),
            b'T' => self.scroll_down(self.p(0, 1)),
            b'r' => {
                let top = self.p(0, 1) - 1;
                let bottom = self.p(1, self.rows) - 1;
                if top < bottom && bottom < self.rows {
                    self.scroll_top = top;
                    self.scroll_bottom = bottom;
                    self.cx = 0;
                    self.cy = 0;
                }
            }
            b'n' => {
                // DSR：5 = 设备状态，6 = 光标位置
                match self.p0(0) {
                    6 => {
                        let resp = format!("\x1b[{};{}R", self.cy + 1, self.cx + 1);
                        self.outbox.extend_from_slice(resp.as_bytes());
                    }
                    5 => self.outbox.extend_from_slice(b"\x1b[0n"),
                    _ => {}
                }
            }
            b'c' => {
                // DA：应答"我是 VT100 兼容终端"
                if self.private == b'>' {
                    self.outbox.extend_from_slice(b"\x1b[>0;10;1c");
                } else {
                    self.outbox.extend_from_slice(b"\x1b[?1;2c");
                }
            }
            b's' => self.save_cursor(),
            b'u' => self.restore_cursor(),
            b'm' => self.sgr(),
            b'h' | b'l' => {
                let on = f == b'h';
                if self.private == b'?' {
                    for i in 0..self.params.len().max(1) {
                        match self.params.get(i).copied().unwrap_or(0) {
                            25 => self.cursor_visible = on,
                            7 => {}
                            1049 | 47 => {
                                for c in self.grid.iter_mut() {
                                    *c = Cell::blank();
                                }
                                self.cx = 0;
                                self.cy = 0;
                            }
                            _ => {}
                        }
                    }
                    self.rev += 1;
                }
            }
            _ => {}
        }
    }

    fn sgr(&mut self) {
        if self.params.is_empty() {
            self.fg = Color::Default;
            self.bg = Color::Default;
            self.attr = Attrs::default();
            return;
        }
        let mut i = 0;
        while i < self.params.len() {
            let code = self.params[i];
            match code {
                0 => {
                    self.fg = Color::Default;
                    self.bg = Color::Default;
                    self.attr = Attrs::default();
                }
                1 => self.attr.bold = true,
                2 => self.attr.dim = true,
                3 => self.attr.italic = true,
                4 => self.attr.underline = true,
                7 => self.attr.reverse = true,
                9 => self.attr.strike = true,
                22 => {
                    self.attr.bold = false;
                    self.attr.dim = false
                }
                23 => self.attr.italic = false,
                24 => self.attr.underline = false,
                27 => self.attr.reverse = false,
                29 => self.attr.strike = false,
                30..=37 => self.fg = Color::Indexed((code - 30) as u8),
                39 => self.fg = Color::Default,
                40..=47 => self.bg = Color::Indexed((code - 40) as u8),
                49 => self.bg = Color::Default,
                90..=97 => self.fg = Color::Indexed((code - 90 + 8) as u8),
                100..=107 => self.bg = Color::Indexed((code - 100 + 8) as u8),
                38 | 48 => {
                    let is_fg = code == 38;
                    // 38;5;n  或  38;2;r;g;b
                    match self.params.get(i + 1).copied() {
                        Some(5) => {
                            if let Some(&n) = self.params.get(i + 2) {
                                let c = Color::Indexed(n as u8);
                                if is_fg {
                                    self.fg = c
                                } else {
                                    self.bg = c
                                }
                                i += 2;
                            }
                        }
                        Some(2) => {
                            let r = self.params.get(i + 2).copied().unwrap_or(0) as u8;
                            let g = self.params.get(i + 3).copied().unwrap_or(0) as u8;
                            let b = self.params.get(i + 4).copied().unwrap_or(0) as u8;
                            let c = Color::Rgb(r, g, b);
                            if is_fg {
                                self.fg = c
                            } else {
                                self.bg = c
                            }
                            i += 4;
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
            i += 1;
        }
    }

    // ---------------- 渲染 ----------------

    /// 生成渲染快照。相邻同样式字符合并成一个 span，减少前端节点数量。
    ///
    /// 颜色保持 `Color` 原样返回，由上层按配色方案解析成 `#rrggbb`——
    /// 这样切换配色时不需要重建终端。
    pub fn snapshot(&self) -> Vec<Row> {
        let mut rows = Vec::with_capacity(self.rows);
        for y in 0..self.rows {
            let mut spans: Vec<Span> = Vec::with_capacity(8);
            for x in 0..self.cols {
                let cell = self.grid[self.idx(x, y)];
                if cell.wide_tail {
                    continue;
                }
                let (fg, bg) = (cell.fg, cell.bg);
                match spans.last_mut() {
                    Some(last) if last.fg == fg && last.bg == bg && last.attr == cell.attr => {
                        last.text.push(cell.ch)
                    }
                    _ => spans.push(Span {
                        text: cell.ch.to_string(),
                        fg,
                        bg,
                        attr: cell.attr,
                    }),
                }
            }
            // 去掉行尾默认底色的空白，避免每行都撑满整宽
            while let Some(last) = spans.last_mut() {
                if last.bg != Color::Default {
                    break;
                }
                let trimmed = last.text.trim_end_matches(' ');
                if trimmed.is_empty() {
                    spans.pop();
                } else {
                    last.text = trimmed.to_string();
                    break;
                }
            }
            rows.push(Row { spans });
        }
        rows
    }
}

fn decode_utf8(buf: &[u8]) -> Option<char> {
    let b0 = buf[0];
    let need = if b0 < 0x80 {
        1
    } else if b0 >> 5 == 0b110 {
        2
    } else if b0 >> 4 == 0b1110 {
        3
    } else if b0 >> 3 == 0b11110 {
        4
    } else {
        return Some('\u{fffd}');
    };
    if buf.len() < need {
        return None;
    }
    std::str::from_utf8(&buf[..need]).ok()?.chars().next()
}

/// 东亚宽字符判定（用于双宽格占位）。
pub fn char_width(c: char) -> usize {
    let u = c as u32;
    let wide = (0x1100..=0x115F).contains(&u)
        || (0x2E80..=0x303E).contains(&u)
        || (0x3041..=0x33FF).contains(&u)
        || (0x3400..=0x4DBF).contains(&u)
        || (0x4E00..=0x9FFF).contains(&u)
        || (0xA000..=0xA4CF).contains(&u)
        || (0xAC00..=0xD7A3).contains(&u)
        || (0xF900..=0xFAFF).contains(&u)
        || (0xFE30..=0xFE6F).contains(&u)
        || (0xFF00..=0xFF60).contains(&u)
        || (0xFFE0..=0xFFE6).contains(&u)
        || (0x1F300..=0x1FAFF).contains(&u);
    if wide {
        2
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn term() -> Term {
        Term::new(20, 5)
    }

    #[test]
    fn plain_text_lands_on_grid() {
        let mut t = term();
        t.feed(b"hello");
        let rows = t.snapshot();
        assert_eq!(rows[0].spans[0].text, "hello");
        assert_eq!(t.cx, 5);
    }

    #[test]
    fn crlf_moves_to_next_line() {
        let mut t = term();
        t.feed(b"ab\r\ncd");
        assert_eq!((t.cy, t.cx), (1, 2));
    }

    #[test]
    fn sgr_sets_color_and_resets() {
        let mut t = term();
        t.feed(b"\x1b[31mred\x1b[0mplain");
        let rows = t.snapshot();
        assert_eq!(rows[0].spans[0].fg, Color::Indexed(1));
        assert_eq!(rows[0].spans.last().unwrap().fg, Color::Default);
    }

    #[test]
    fn truecolor_sgr() {
        let mut t = term();
        t.feed(b"\x1b[38;2;10;20;30mx");
        let rows = t.snapshot();
        assert_eq!(rows[0].spans[0].fg, Color::Rgb(10, 20, 30));
    }

    #[test]
    fn cursor_position_is_one_based() {
        let mut t = term();
        t.feed(b"\x1b[3;5HZ");
        assert_eq!((t.cy, t.cx), (2, 5));
    }

    #[test]
    fn erase_line_clears_to_end() {
        let mut t = term();
        t.feed(b"abcdef\x1b[1;3H\x1b[K");
        let rows = t.snapshot();
        assert_eq!(rows[0].spans[0].text, "ab");
    }

    #[test]
    fn scroll_into_scrollback() {
        let mut t = Term::new(10, 2);
        t.feed(b"a\r\nb\r\nc");
        assert_eq!(t.scrollback.len(), 1);
        assert_eq!(t.cy, 1);
    }

    #[test]
    fn cjk_takes_two_cells() {
        let mut t = term();
        t.feed("中文".as_bytes());
        assert_eq!(t.cx, 4);
        let rows = t.snapshot();
        assert_eq!(rows[0].spans[0].text, "中文");
    }

    #[test]
    fn utf8_split_across_feeds() {
        let mut t = term();
        let bytes = "中".as_bytes();
        t.feed(&bytes[..2]);
        t.feed(&bytes[2..]);
        let rows = t.snapshot();
        assert_eq!(rows[0].spans[0].text, "中");
    }

    #[test]
    fn dsr_reports_cursor_position() {
        let mut t = Term::new(20, 5);
        t.feed(b"\x1b[3;7H\x1b[6n");
        assert_eq!(t.outbox, b"\x1b[3;7R".to_vec());
    }

    #[test]
    fn da_answers_vt100() {
        let mut t = Term::new(20, 5);
        t.feed(b"\x1b[c");
        assert_eq!(t.outbox, b"\x1b[?1;2c".to_vec());
    }

    #[test]
    fn scroll_region_limits_scrolling() {
        let mut t = Term::new(10, 6);
        t.feed(b"\x1b[2;4r");
        assert_eq!((t.scroll_top, t.scroll_bottom), (1, 3));
    }
}
