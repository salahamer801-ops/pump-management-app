import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { AppProvider } from "../store";
import { managerStorageKey } from "../domain/storage";
import { loadActivePumpId, saveActivePumpId } from "../session";
import ManagerApp from "./ManagerApp";
import PumpGate from "./PumpGate";

/**
 * بوابة المسؤول: لا يصل إلا إلى المضخات التي يديرها فعليًا (§23).
 * لكل مضخة مخزن تشغيل مستقل مرتبط بمعرّفها من الخادم.
 */
export default function ManagerShell() {
  const { session, refresh } = useAuth();
  const pumps = session?.managedPumps ?? [];
  const [activeId, setActiveId] = useState<string | null>(() => loadActivePumpId());
  const [gateOpen, setGateOpen] = useState(false);

  const active = pumps.find((p) => p.id === activeId) ?? pumps[0] ?? null;

  useEffect(() => {
    if (active && active.id !== activeId) {
      setActiveId(active.id);
      saveActivePumpId(active.id);
    }
  }, [active, activeId]);

  useEffect(() => {
    /* تحديث عدد الطلبات المعلّقة عند الدخول */
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string) => {
    saveActivePumpId(id);
    setActiveId(id);
    setGateOpen(false);
  };

  if (!active || gateOpen) {
    return (
      <PumpGate
        onSelect={select}
        onCancel={active ? () => setGateOpen(false) : undefined}
        activePumpId={active?.id ?? null}
      />
    );
  }

  return (
    <AppProvider key={active.id} storageKey={managerStorageKey(active.id)} adoptName={active.name}>
      <ManagerApp pump={active} onSwitchPump={() => setGateOpen(true)} />
    </AppProvider>
  );
}
