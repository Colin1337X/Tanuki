mod policy;
use std::sync::{Arc, Mutex};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

type Selected = Arc<Mutex<Option<Url>>>;

#[tauri::command]
async fn connect_server(webview: tauri::WebviewWindow, selected: tauri::State<'_, Selected>, address: String) -> Result<(), String> {
    let current = webview.url().map_err(|_| "Cannot inspect current page")?;
    if webview.label() != "main" || !policy::local_launcher(&current) {
        return Err("Only the bundled launcher can choose a server.".into());
    }
    let origin = policy::server_origin(&address).map_err(str::to_owned)?;
    {
        let mut selection = selected.lock().map_err(|_| "Server selection unavailable")?;
        if selection.is_some() { return Err("Restart the client to change servers.".into()); }
        // Clear previous cookies/storage before selecting another account or institution.
        webview.clear_all_browsing_data().map_err(|_| "Cannot clear previous workspace data")?;
        *selection = Some(origin.clone());
    }
    // Android queues clearing asynchronously. Do not navigate with a previous
    // account's cookies just because the clear request was accepted.
    let checked_window = webview.clone();
    let checked_origin = origin.clone();
    let cleared = tauri::async_runtime::spawn_blocking(move || {
        for _ in 0..60 {
            match checked_window.cookies_for_url(checked_origin.clone()) {
                Ok(cookies) if cookies.is_empty() => return true,
                Ok(_) => std::thread::sleep(std::time::Duration::from_millis(50)),
                Err(_) => return false,
            }
        }
        false
    }).await.unwrap_or(false);
    if !cleared {
        *selected.lock().map_err(|_| "Server selection unavailable")? = None;
        return Err("Previous session data could not be cleared. Close and restart the client.".into());
    }
    if webview.navigate(origin.join("login").map_err(|_| "Invalid login address")?).is_err() {
        *selected.lock().map_err(|_| "Server selection unavailable")? = None;
        return Err("Cannot open this server. Restart and check the address.".into());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let selected: Selected = Arc::new(Mutex::new(None));
    let navigation = selected.clone();
    tauri::Builder::default()
        .manage(selected)
        .invoke_handler(tauri::generate_handler![connect_server])
        .setup(move |app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Tanuki Stories")
                .inner_size(1100.0, 780.0)
                .min_inner_size(360.0, 540.0)
                .devtools(false)
                .incognito(true)
                .on_navigation(move |target| {
                    let Ok(selection) = navigation.lock() else { return false; };
                    match selection.as_ref() {
                        Some(origin) => policy::allows(origin, target),
                        None => policy::local_launcher(target),
                    }
                })
                .on_download(|_, _| false)
                .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny);
            #[cfg(desktop)]
            let window = window.on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tanuki client could not start");
}

