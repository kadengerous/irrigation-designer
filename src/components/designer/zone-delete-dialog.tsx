import { zoneLabel } from "@/lib/project-types";
import { text as uiText } from "@/lib/i18n";
import { useLayoutEffect, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";

type Request = { id: number; anchor: HTMLElement };

/** Both zone entry points use the same confirmation and atomic transfer. */
export function useZoneDeletion() {
  const [request, setRequest] = useState<Request | null>(null);
  return {
    askDelete: (id: number, anchor: HTMLElement) => {
      const state = useProject.getState();
      if (state.project.zones.length <= 1) {
        toast.info(tr(state.locale, "lastZoneHint"));
        return;
      }
      setRequest({ id, anchor });
    },
    dialog: request && <ZoneDeleteDialog request={request} onClose={() => setRequest(null)} />,
  };
}

function ZoneDeleteDialog({ request, onClose }: { request: Request; onClose: () => void }) {
  const project = useProject(s => s.project);
  const locale = useProject(s => s.locale);
  const t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const [destination, setDestination] = useState<number | null>(null);
  const [panel, setPanel] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const zone = project.zones.find(z => z.id === request.id);
  const heads = project.heads.filter(h => h.zone === request.id);
  const alternatives = project.zones.filter(z => z.id !== request.id && !z.locked);
  const target = alternatives.find(z => z.id === destination) ?? alternatives[0];
  const blocked = !zone || zone.locked || heads.some(h => h.locked) || (heads.length > 0 && !target) || project.zones.length <= 1;

  useLayoutEffect(() => {
    const el = request.anchor.closest<HTMLElement>(".info-panel,[data-mobile-sheet],.mobile-sheet") ?? request.anchor.parentElement!;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const left = Math.max(0, r.left), top = Math.max(0, r.top);
      setPanel({ left, top, width: Math.min(window.innerWidth, r.right) - left, height: Math.min(window.innerHeight, r.bottom) - top });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [request.anchor]);

  const width = Math.min(320, Math.max(240, panel.width - 16), window.innerWidth - 24);
  const left = Math.max(12 + width / 2, Math.min(window.innerWidth - 12 - width / 2, panel.left + panel.width / 2));
  const top = Math.max(160, Math.min(window.innerHeight - 160, panel.top + panel.height / 2));
  const name = zone ? zoneLabel(zone) : uiText("zone");
  return <AlertDialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="zone-delete-shade" style={panel} />
      <AlertDialog.Content className="zone-delete-dialog" style={{ left, top, width }}
        onCloseAutoFocus={event => { event.preventDefault(); if (request.anchor.isConnected) request.anchor.focus(); }}>
        <AlertDialog.Title className="zone-delete-title">{t("zoneDeleteQuestion", { name })}</AlertDialog.Title>
        <AlertDialog.Description className="zone-delete-description">
          {heads.length ? t("zoneHeadCount", { n: heads.length }) : t("zoneIsEmpty")}
        </AlertDialog.Description>
        {heads.length > 0 && <label className="head-placement-label">
          {t("zoneTransferDestination")}
          <select aria-label={t("zoneTransferDestination")} value={target?.id ?? ""} disabled={!target}
            onChange={event => setDestination(Number(event.target.value))}>
            {!target && <option value="">{t("zoneNoDestination")}</option>}
            {alternatives.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}
          </select>
        </label>}
        <div className="head-placement-actions">
          <AlertDialog.Cancel asChild><button type="button">{t("cancel")}</button></AlertDialog.Cancel>
          <AlertDialog.Action asChild><button type="button" className="irrigation-delete-action" disabled={blocked}
            onClick={() => useProject.getState().removeZone(request.id, heads.length ? target?.id : undefined)}>
            <Trash2 size={16}/>{t(heads.length ? "deleteZone" : "delete")}
          </button></AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
