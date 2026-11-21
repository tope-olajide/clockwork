import type { ChatAttachment } from "@shared/protocol";
import type { ProjectDocument } from "../../../engine/model/schema";
import { importAssetFile, removeAssetBlob } from "../../../engine/assets/asset-store";
import { useEngineStore } from "../../../engine/store/engine-store";

/**
 * Import chat attachments as project assets. The message is only sent after every
 * file succeeds; assets created by a failed attempt are removed again.
 */
export async function importChatAttachments(files: File[], _document: ProjectDocument): Promise<ChatAttachment[]> {
  const store = useEngineStore.getState();
  const created: string[] = [];
  const attachments: ChatAttachment[] = [];
  try {
    for (const file of files) {
      const document = useEngineStore.getState().document;
      if (!document) throw new Error("No project open.");
      const imported = await importAssetFile(file, document);
      if (!imported.reused) {
        const outcome = store.dispatch("asset.add", { asset: imported.asset });
        if (!outcome.ok) {
          await removeAssetBlob(imported.asset.id).catch(() => undefined);
          throw new Error(outcome.error || `Could not add ${file.name}.`);
        }
        created.push(imported.asset.id);
      }
      attachments.push({
        assetId: imported.asset.id,
        name: imported.asset.name,
        kind: imported.asset.kind === "audio" ? "audio" : "image",
        mime: imported.asset.mime,
        size: imported.asset.size ?? file.size,
        width: imported.asset.width,
        height: imported.asset.height,
        thumbnail: imported.asset.thumbnail,
      });
    }
    if (attachments.length > 0) await useEngineStore.getState().saveNow();
    return attachments;
  } catch (error) {
    for (const assetId of created.reverse()) {
      useEngineStore.getState().dispatch("asset.delete", { assetId });
      await removeAssetBlob(assetId).catch(() => undefined);
    }
    throw error;
  }
}
