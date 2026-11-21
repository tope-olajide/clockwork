import { useEffect, useState } from "react";
import { FileAudio, Image as ImageIcon } from "lucide-react";
import type { ChatAttachment } from "@shared/protocol";
import { readAssetBlob } from "../../../engine/assets/asset-store";
import { formatBytes } from "./chat-utils";

export function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (attachment.kind !== "audio") return;
    let url: string | null = null;
    let cancelled = false;
    void readAssetBlob(attachment.assetId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setAudioUrl(url);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.assetId, attachment.kind]);

  return (
    <figure className={`chat-attachment chat-attachment-${attachment.kind}`} data-testid={`chat-attachment-${attachment.assetId}`}>
      <div className="chat-attachment-preview">
        {attachment.kind === "image" && attachment.thumbnail
          ? <img src={attachment.thumbnail} alt="" />
          : attachment.kind === "audio"
            ? <FileAudio size={22} aria-hidden="true" />
            : <ImageIcon size={22} aria-hidden="true" />}
      </div>
      <figcaption>
        <strong title={attachment.name}>{attachment.name}</strong>
        <span>{formatBytes(attachment.size)} · in Assets</span>
        {attachment.kind === "audio" && audioUrl && (
          <audio controls preload="metadata" src={audioUrl} aria-label={`Preview ${attachment.name}`} />
        )}
      </figcaption>
    </figure>
  );
}
