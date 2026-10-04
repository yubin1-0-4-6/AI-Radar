// 避免 release 模式下多出一个黑色控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_radar_lib::run()
}