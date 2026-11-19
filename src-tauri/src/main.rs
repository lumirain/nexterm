// Windows 下 release 不弹控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexterm_lib::run()
}
