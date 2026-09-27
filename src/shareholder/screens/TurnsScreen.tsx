import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  Droplets,
  Fuel,
  Plus,
  Trash2,
} from "lucide-react";
import { useShareholder } from "../store";
import {
  activeCycles,
  activePumps,
  findCycle,
  findPump,
  turnViews,
} from "../selectors";
import {
  cycleDayDate,
  dieselCost,
  dieselLiters,
  lendCost,
  minutesToTime,
  timeToMinutes,
  uid,
} from "../calc";
import { formatDateShort, formatLiters, formatMoneyYER, formatNumber, formatTimeAmPm } from "../format";
import type { LendDirection, LendUnit, ShareholderTurn } from "../types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  Pill,
  Select,
  TextArea,
  TimeInput,
} from "../../components/ui";

export default function TurnsScreen() {
  const { state, actions } = useShareholder();
  const pumps = activePumps(state);
  const cycles = activeCycles(state);
  const views = turnViews(state);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShareholderTurn | null>(null);
  /** إزالة دور بحذف ناعم: سبب موثّق والسجل يبقى محفوظًا */
  const [removeTurn, setRemoveTurn] = useState<ShareholderTurn | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const [pumpId, setPumpId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [dayIndex, setDayIndex] = useState(1);
  const [hours, setHours] = useState(12);
  const [startTime, setStartTime] = useState("06:00");
  const [dieselPrice, setDieselPrice] = useState(1200);
  const [direction, setDirection] = useState<LendDirection | "">("");
  const [lendUnit, setLendUnit] = useState<LendUnit>("hour");
  const [lendQty, setLendQty] = useState(1);
  const [royaltyPaid, setRoyaltyPaid] = useState(false);
  const [note, setNote] = useState("");

  const pump = findPump(state, pumpId);
  const cycle = findCycle(state, cycleId);
  const pumpCycles = cycles.filter((c) => c.pumpId === pumpId);

  useEffect(() => {
    if (!pump) return;
    setHours(pump.dailyHours || 12);
    setStartTime(pump.startTime || "06:00");
    setDieselPrice(pump.dieselPricePerLiter || 0);
  }, [pumpId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pumpCycles.length && !pumpCycles.find((c) => c.id === cycleId)) {
      setCycleId(pumpCycles[0].id);
    }
    if (pumpCycles.length === 0) setCycleId("");
  }, [pumpId, pumpCycles, cycleId]);

  const endTime = useMemo(
    () => minutesToTime(timeToMinutes(startTime) + (Number(hours) || 0) * 60),
    [startTime, hours]
  );

  const preview = useMemo(() => {
    const p = pump;
    const liters = p ? dieselLiters(Number(hours) || 0, p) : 0;
    const cost = p ? dieselCost(Number(hours) || 0, p, Number(dieselPrice) || 0) : 0;
    const lc = p ? lendCost(p, direction ? lendUnit : null, Number(lendQty) || 0, Number(dieselPrice) || 0) : 0;
    return { liters, cost, lc };
  }, [pump, hours, dieselPrice, direction, lendUnit, lendQty]);

  const openAdd = () => {
    setEditing(null);
    setPumpId(pumps[0]?.id ?? "");
    setCycleId("");
    setDayIndex(1);
    setHours(pumps[0]?.dailyHours ?? 12);
    setStartTime(pumps[0]?.startTime ?? "06:00");
    setDieselPrice(pumps[0]?.dieselPricePerLiter ?? 0);
    setDirection("");
    setLendUnit("hour");
    setLendQty(1);
    setRoyaltyPaid(false);
    setNote("");
    setOpen(true);
  };

  const openEdit = (t: ShareholderTurn) => {
    const tPump = findPump(state, t.pumpId);
    setEditing(t);
    setPumpId(t.pumpId);
    setCycleId(t.cycleId);
    setDayIndex(t.dayIndex);
    setHours(t.hours);
    setStartTime(t.startTime);
    setDieselPrice(
      t.dieselLiters > 0 ? Math.round((t.dieselCost / t.dieselLiters) * 100) / 100 : tPump?.dieselPricePerLiter ?? 0
    );
    setDirection(t.direction ?? "");
    setLendUnit(t.lendUnit ?? "hour");
    setLendQty(t.lendQty || 1);
    setRoyaltyPaid(t.royaltyPaid);
    setNote(t.note);
    setOpen(true);
  };

  const save = () => {
    if (!pump || !cycle) return;
    const h = Number(hours) || 0;
    const date = cycleDayDate(cycle.startDate, dayIndex).toISOString();
    const liters = pump ? dieselLiters(h, pump) : 0;
    const cost = pump ? dieselCost(h, pump, Number(dieselPrice) || 0) : 0;
    const lc = pump ? lendCost(pump, direction ? lendUnit : null, Number(lendQty) || 0, Number(dieselPrice) || 0) : 0;
    const turn: ShareholderTurn = {
      id: editing?.id ?? uid(),
      cycleId,
      pumpId,
      dayIndex: Math.max(1, Number(dayIndex) || 1),
      date,
      hours: h,
      startTime,
      endTime,
      dieselLiters: liters,
      dieselCost: cost,
      direction: direction || null,
      lendUnit: direction ? lendUnit : null,
      lendQty: direction ? Number(lendQty) || 0 : 0,
      lendCost: lc,
      royaltyPaid,
      note,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    if (editing) actions.updateTurn(turn);
    else actions.addTurn(turn);
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">دوري</h1>
          <p className="mt-0.5 text-[11px] font-bold text-gray-400 dark:text-slate-400">
            أدواري المسجَّلة في سجلي الخاص
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={pumps.length === 0 || cycles.length === 0}
          aria-label="تسجيل دور"
          data-testid="open-turn-form"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-l from-emerald-600 to-emerald-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          <Plus size={16} /> تسجيل
        </button>
      </div>

      {pumps.length === 0 || cycles.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={26} />}
          title="لا يمكن تسجيل دور بعد"
          description="أضف مضخة وأنشئ دياله أولًا."
        />
      ) : views.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={26} />}
          title="لا توجد أدوار مسجلة"
          description="سجّل دورك في كل مضخة وسيُحسب الديزل والرواسة تلقائيًا."
          action={
            <Button onClick={openAdd}>
              <Plus size={18} /> تسجيل أول دور
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {views.map(({ turn, pump: p, cycle: c }) => (
            <Card key={turn.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Droplets size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-extrabold text-gray-900">{p?.name ?? "—"}</span>
                    <span className="text-xs text-gray-400">اليوم {turn.dayIndex}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {formatDateShort(turn.date)} · {c?.name ?? ""} · {formatNumber(turn.hours)} ساعة
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone="blue">
                      <Fuel size={11} /> {formatLiters(turn.dieselLiters)} ={" "}
                      {formatMoneyYER(turn.dieselCost)}
                    </Pill>
                    {turn.direction && (
                      <Pill tone={turn.direction === "borrow" ? "red" : "amber"}>
                        {turn.direction === "borrow" ? (
                          <ArrowDownLeft size={11} />
                        ) : (
                          <ArrowUpRight size={11} />
                        )}
                        {turn.direction === "borrow" ? "تسلفت" : "سلفت"}{" "}
                        {formatMoneyYER(turn.lendCost)}
                      </Pill>
                    )}
                    <Pill tone={turn.royaltyPaid ? "green" : "amber"}>
                      الرواس: {turn.royaltyPaid ? "سددت" : "أجل"}
                    </Pill>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => openEdit(turn)}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => {
                      setRemoveTurn(turn);
                      setRemoveReason("");
                    }}
                    className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="إزالة الدور"
                    data-testid="remove-turn"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "تعديل دور" : "تسجيل دور"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="المضخة">
              <Select
                value={pumpId}
                onChange={(e) => {
                  setPumpId(e.target.value);
                  setCycleId("");
                }}
              >
                <option value="">اختر…</option>
                {pumps.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="الدياله">
              <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                <option value="">اختر…</option>
                {pumpCycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="اليوم">
              <NumberInput
                value={dayIndex || ""}
                onChange={(e) => setDayIndex(Number(e.target.value))}
              />
            </Field>
            <Field label="الساعات">
              <NumberInput
                value={hours || ""}
                step="0.5"
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </Field>
            <Field label="وقت البدء">
              <TimeInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800">
            نهاية دوري تلقائيًا: {formatTimeAmPm(endTime)}
          </div>

          <Field label="سعر لتر الديزل هنا (ر.ي)" hint="مُملأ من بيانات المضخة وقابل للتعديل">
            <NumberInput
              value={dieselPrice || ""}
              onChange={(e) => setDieselPrice(Number(e.target.value))}
            />
          </Field>

          <Field label="هل سلفت أو تسلفت؟">
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as LendDirection | "")}
            >
              <option value="">لا يوجد سلفة/تسلفة</option>
              <option value="lend">سلفت (لي عند غيري)</option>
              <option value="borrow">تسلفت (عليّ)</option>
            </Select>
          </Field>

          {direction && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="الوحدة">
                <Select
                  value={lendUnit}
                  onChange={(e) => setLendUnit(e.target.value as LendUnit)}
                >
                  <option value="hour">ساعة</option>
                  <option value="cycle">دور كامل</option>
                </Select>
              </Field>
              <Field label="الكمية">
                <NumberInput
                  value={lendQty || ""}
                  step="0.5"
                  onChange={(e) => setLendQty(Number(e.target.value))}
                />
              </Field>
            </div>
          )}

          <Field label="الرواسة">
            <Select
              value={royaltyPaid ? "yes" : "no"}
              onChange={(e) => setRoyaltyPaid(e.target.value === "yes")}
            >
              <option value="yes">سددت</option>
              <option value="no">أجل</option>
            </Select>
          </Field>

          <Field label="ملاحظة">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {/* live preview */}
          <div className="rounded-2xl bg-gray-50 p-4 text-sm">
            <div className="mb-2 font-extrabold text-gray-700">الحسبة التلقائية</div>
            <div className="space-y-1 text-gray-600">
              <div>الديزل: {formatLiters(preview.liters)}</div>
              <div>تكلفة الديزل: <b>{formatMoneyYER(preview.cost)}</b></div>
              {direction && (
                <div>
                  {direction === "borrow" ? "قيمة التسلفة:" : "قيمة السلفة:"}{" "}
                  <b className={direction === "borrow" ? "text-red-600" : "text-amber-600"}>
                    {formatMoneyYER(preview.lc)}
                  </b>
                </div>
              )}
              <div>
                الرواسة:{" "}
                <b>{royaltyPaid ? "سددت" : "أجل"}</b>
                {pump && royaltyPaid === false && (
                  <span className="text-red-600"> ({formatMoneyYER(pump.royaltyCost)})</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              إلغاء
            </Button>
            <Button onClick={save} disabled={!pump || !cycle} className="flex-1">
              حفظ الدور
            </Button>
          </div>
        </div>
      </Modal>

      {/* إزالة دور: حذف ناعم بسبب موثّق — لا يُحذف أي سجل */}
      <Modal open={Boolean(removeTurn)} onClose={() => setRemoveTurn(null)} title="إزالة دور">
        {removeTurn ? (
          <div className="space-y-4">
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              سيُخفى دور <b>{removeTurn.date}</b> ({removeTurn.startTime} → {removeTurn.endTime} ·{" "}
              {removeTurn.hours} ساعة) من قوائمك، لكن <b>السجل يبقى محفوظًا</b> مع سبب الإزالة ووقته — لا يُحذف
              أي سجل نهائيًا.
            </p>
            <Field label="سبب الإزالة (يُسجَّل في سجل التغييرات)">
              <TextArea
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="مثال: سجّلته بالخطأ / بيع الدور لغيري"
                data-testid="remove-turn-reason"
              />
            </Field>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRemoveTurn(null)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  actions.deleteTurn(removeTurn.id, { reason: removeReason });
                  setRemoveTurn(null);
                }}
                data-testid="remove-turn-confirm"
              >
                <Trash2 size={16} /> إزالة الدور
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}