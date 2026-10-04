use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

/// 托盘上显示的未读数。0 时隐藏徽标。
static UNREAD: Mutex<i64> = Mutex::new(0);

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    // 只允许 http/https，避免被诱导打开本地协议
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(format!("refuse to open non-http url: {url}"));
    }
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_unread_count(app: AppHandle, count: i64) {
    *UNREAD.lock().unwrap() = count;
    let title = if count > 0 {
        format!("AI Radar ({count})")
    } else {
        "AI Radar".to_string()
    };
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(&title));
    }
    // 任务栏角标按未读数显示；窗口隐藏时也要能刷新，所以走 AppHandle 找窗口
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_badge_count((count > 0).then_some(count));
    }
}

#[tauri::command]
fn set_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
}

#[tauri::command]
fn toggle_window(app: AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    match win.is_visible() {
        Ok(true) => {
            let _ = win.hide();
        }
        _ => {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}

fn build_menu(app: &AppHandle) -> Menu<tauri::Wry> {
    let open = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>).unwrap();
    let refresh = MenuItem::with_id(app, "refresh", "立即刷新（R）", true, None::<&str>).unwrap();
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>).unwrap();
    Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app).unwrap(),
            &refresh,
            &PredefinedMenuItem::separator(app).unwrap(),
            &quit,
        ],
    )
    .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        // 托盘常驻型应用必须有开机自启，否则用户关掉窗口后就没入口了
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            open_external,
            set_unread_count,
            set_tooltip,
            toggle_window
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_menu(&handle);

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("AI Radar · 全球 AI 情报雷达")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" | "refresh" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                        if event.id.as_ref() == "refresh" {
                            let _ = app.emit_to("main", "radar://refresh", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle().clone());
                    }
                })
                .build(app)?;

            // 开机自启时带 --minimized：只进托盘，不弹窗
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭窗口只是收进托盘，真正退出走托盘菜单
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running AI Radar");
}