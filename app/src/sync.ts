import Dexie from "dexie";
import { exportAll, importAll, isEmpty } from "./db";
import { cloudLoad, cloudSave, inArtifact } from "./platform";

let timer: ReturnType<typeof setTimeout> | null = null;
let ready = false;

/** عند الفتح: لو الجهاز فاضي نرجّع من السحابة، وبعدها نحفظ كل تغيير */
export async function startSync(): Promise<void> {
  if (!inArtifact) return;
  if (await isEmpty()) {
    const json = await cloudLoad();
    if (json) { try { await importAll(json); } catch { /* نسخة تالفة */ } }
  }
  ready = true;
  Dexie.on("storagemutated", () => {
    if (!ready) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => cloudSave(await exportAll()), 3000);
  });
}
