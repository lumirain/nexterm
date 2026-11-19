//! NexTerm 数据层。
//!
//! 刻意不依赖 Tauri、不依赖任何 GUI 或平台库：这里只放"能被单独测试"的东西。
//! 上层（`src-tauri`）负责把它接到窗口与 IPC 上。
//!
//! * [`model`]：自有数据模型（会话 / 分组 / 配色 / 高亮集），字段与任何第三方
//!   终端软件的配置格式无关；
//! * [`store`]：自有 JSON 存储与种子数据；
//! * [`vt`]：终端网格与 VT 控制序列解析。

pub mod model;
pub mod store;
pub mod vt;
