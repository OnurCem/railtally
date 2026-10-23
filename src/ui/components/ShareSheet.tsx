import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCode } from "../../sync/protocol";
import { Sheet } from "./Sheet";

export const joinLink = (code: string) => `${window.location.origin}${window.location.pathname}#join=${code}`;

export function ShareSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = joinLink(code);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t("app.name"), text: t("share.message", { code: formatCode(code) }), url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      /* the share dialog was dismissed, or the clipboard is blocked */
    }
  };

  return (
    <Sheet title={t("share.title")} onClose={onClose} testId="share-sheet">
      <p className="muted">{t("share.intro")}</p>
      <p className="room-code" data-testid="room-code" aria-label={t("share.code")}>
        {formatCode(code)}
      </p>
      <p className="small muted">{link}</p>
      <button className="button primary big" onClick={() => void share()} data-testid="share-link">
        {t("share.send")}
      </button>
      {copied && <p role="status">{t("share.copied")}</p>}
      <p className="small muted">{t("share.privacy")}</p>
    </Sheet>
  );
}
