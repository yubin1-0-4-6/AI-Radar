import { isTauri } from "./lib/http";

/** 统一的外壳能力入口：非 Tauri 环境（浏览器 dev）全部降级为 no-op / window.open */

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (granted) mod.sendNotification({ title, body });
  } catch {
    /* 通知不可用不影响主流程 */
  }
}

export async function setTrayCount(count: number): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_unread_count", { count });
  } catch {
    /* ignore */
  }
}

export async function updateTrayTooltip(text: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_tooltip", { text });
  } catch {
    /* ignore */
  }
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const mod = await import("@tauri-apps/plugin-autostart");
    return await mod.isEnabled();
  } catch {
    return false;
  }
}

export async function setAutostart(enable: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const mod = await import("@tauri-apps/plugin-autostart");
    await (enable ? mod.enable() : mod.disable());
    return await mod.isEnabled();
  } catch {
    return false;
  }
}