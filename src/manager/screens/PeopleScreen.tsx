import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CalendarRange,
  Coins,
  History,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useApp } from "../../store";
import type { Person, RightKind, ShareRight, Shareholder } from "../../domain/types";
import {
  activeShareholders,
  currentRight,
  findPerson,
  personPumpRelations,
  rightsOfShareholder,
  shareholderOfPerson,
  shareholderUseStatus,
  useStatusLabel,
  useStatusTone,
} from "../../domain/rules";
import { formatNumber } from "../../format";
import { isoToShort, todayISO, uid } from "../../domain/util";
import {
  Button,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  Pill,
  Select,
  TextArea,
  TextInput,
  cx,
} from "../../components/ui";
import PersonPicker from "../../components/PersonPicker";

const RIGHT_KINDS: { id: RightKind; label: string }[] = [
  { id: "rent", label: "تأجير" },
  { id: "gift", label: "إعطاء / تنازل" },
  { id: "transfer", label: "نقل الحق" },
  { id: "loan", label: "إعارة" },
  { id: "inherit", label: "توريث" },
  { id: "move_pump", label: "نقل السهم لمضخة أخرى" },
  { id: "return", label: "إعادة الحق للمساهم" },
];

export default function PeopleScreen() {
  const { state } = useApp();
  const pump = state.pump!;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "shareholders" | "holders" | "guests">("all");
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Person | null>(null);

  const persons = useMemo(() => {
    let list = state.persons.filter((p) => !p.archived);
    if (query.trim()) {
      const q = query.trim();
      list = list.filter((p) => p.name.includes(q) || (p.phone && p.phone.includes(q)));
    }
    if (filter === "shareholders")
      list = list.filter((p) => !!shareholderOfPerson(state, pump.id, p.id));
    if (filter === "holders")
      list = list.filter((p) =>
        state.rights.some((r) => r.pumpId === pump.id && r.holderPersonId === p.id && r.status === "active")
      );
    if (filter === "guests") list = list.filter((p) => p.guest);
    return list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [state, pump.id, query, filter]);

  const duplicates = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of state.persons.filter((x) => !x.archived)) {
      map.set(p.name, (map.get(p.name) ?? 0) + 1);
    }
    return new Set(Array.from(map.entries()).filter(([, c]) => c > 1).map(([n]) => n));
  }, [state.persons]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف…"
            className="pr-11"
            aria-label="بحث عن شخص"
          />
        </div>
        <Button onClick={() => setCreating(true)} className="px-3">
          <Plus size={18} />
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { id: "all", label: "الكل" },
            { id: "shareholders", label: "المساهمون الأساسيون" },
            { id: "holders", label: "أصحاب الحقوق" },
            { id: "guests", label: "الضيوف" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition",
              filter === f.id
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {persons.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title="لا يوجد أشخاص"
          description="أضف الأشخاص أولًا، ثم سجّل من هو المساهم الأساسي ومن هو صاحب الحق."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus size={18} /> إضافة شخص
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {persons.map((person) => {
            const tags = personPumpRelations(state, pump.id, person.id);
            const shareholder = shareholderOfPerson(state, pump.id, person.id);
            const units = state.shareholders
              .filter((s) => s.personId === person.id && !s.archived)
              .reduce((sum, s) => sum + s.units, 0);
            const held = state.rights.filter(
              (r) => r.pumpId === pump.id && r.holderPersonId === person.id && r.status === "active"
            );
            return (
              <button
                key={person.id}
                onClick={() => setDetail(person)}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 text-right transition hover:border-emerald-200 dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {person.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
                      {person.name}
                    </span>
                    {duplicates.has(person.name) ? <Pill tone="amber">اسم متكرر</Pill> : null}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {tags.length === 0 ? (
                      <Pill tone="gray">بلا علاقة مسجّلة</Pill>
                    ) : (
                      tags.map((t, i) => (
                        <Pill key={i} tone={t.tone}>
                          {t.label}
                        </Pill>
                      ))
                    )}
                  </span>
                  <span className="mt-1 block text-[11px] text-gray-400">
                    {person.phone ? `${person.phone} · ` : ""}
                    {shareholder ? `${formatNumber(units)} ${pump.shareUnit}` : "لا سهم مسجّل"}
                    {held.length > 0 ? ` · صاحب ${held.length} حق` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="px-1 text-[10px] leading-relaxed text-gray-400">
        النظام يعتمد على معرّفات فريدة لا على الأسماء — تكرار الاسم لا يدمج السجلات أبدًا، ويظهر هنا كتنبيه فقط.
      </p>

      <PersonForm
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || !!editing}
        person={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      {detail ? (
        <PersonDetail
          person={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PersonForm({
  open,
  person,
  onClose,
}: {
  open: boolean;
  person: Person | null;
  onClose: () => void;
}) {
  const { actions } = useApp();
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [nationalId, setNationalId] = useState(person?.nationalId ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title={person ? "تعديل بيانات شخص" : "إضافة شخص"}>
      <div className="space-y-3">
        <Field label="الاسم">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="الهاتف (اختياري)">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="text-left" />
        </Field>
        <Field label="رقم الهوية / معرف داخلي (اختياري)" hint="يساعد في التمييز بين الأسماء المتشابهة">
          <TextInput value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Button
          className="w-full"
          disabled={!name.trim()}
          onClick={() => {
            const next: Person = {
              id: person?.id ?? uid("pr"),
              name: name.trim(),
              phone: phone.trim(),
              nationalId: nationalId.trim(),
              notes: notes.trim(),
              guest: person?.guest ?? false,
              archived: person?.archived ?? false,
              createdAt: person?.createdAt ?? todayISO(),
              createdBy: person?.createdBy ?? "manager",
            };
            actions.savePerson(next, !person);
            onClose();
          }}
        >
          <ShieldCheck size={16} /> حفظ
        </Button>
      </div>
    </Modal>
  );
}

function PersonDetail({
  person,
  onClose,
  onEdit,
}: {
  person: Person;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const shareholder = shareholderOfPerson(state, pump.id, person.id);
  const rights = shareholder ? rightsOfShareholder(state, shareholder.id) : [];
  const activeRight = shareholder ? currentRight(state, shareholder.id) : null;
  const [shareModal, setShareModal] = useState(false);
  const [rightModal, setRightModal] = useState(false);
  const [endRightId, setEndRightId] = useState<string | null>(null);
  const usages = state.usages.filter((u) => u.personId === person.id && u.status === "active");
  const balance = state.transactions
    .filter((t) => t.personId === person.id && t.status === "posted")
    .reduce((s, t) => s + (t.direction === "debit" ? t.amount : -t.amount), 0);

  return (
    <Modal open onClose={onClose} title={person.name}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {personPumpRelations(state, pump.id, person.id).map((t, i) => (
            <Pill key={i} tone={t.tone}>
              {t.label}
            </Pill>
          ))}
          {person.phone ? (
            <Pill tone="gray">
              <Phone size={11} /> {person.phone}
            </Pill>
          ) : null}
          {person.nationalId ? <Pill tone="gray">معرّف: {person.nationalId}</Pill> : null}
        </div>
        {person.notes ? (
          <p className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-slate-700 dark:text-slate-300">
            {person.notes}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-[10px] font-bold text-gray-400">الرصيد</div>
            <div className={cx("text-sm font-extrabold", balance > 0 ? "text-red-600" : "text-emerald-700")}>
              {formatNumber(balance)}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-[10px] font-bold text-gray-400">عمليات استخدام</div>
            <div className="text-sm font-extrabold text-gray-800 dark:text-white">{usages.length}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-[10px] font-bold text-gray-400">حقوق مسجّلة</div>
            <div className="text-sm font-extrabold text-gray-800 dark:text-white">{rights.length}</div>
          </div>
        </div>

        {shareholder ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <div className="flex items-center gap-2">
              <Coins size={15} className="text-emerald-600" />
              <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                المساهم الأساسي (سجل مرجعي ثابت)
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill tone={useStatusTone(shareholderUseStatus(shareholder))}>
                حالة الاستخدام: {useStatusLabel(shareholderUseStatus(shareholder))}
              </Pill>
              {shareholder.counterpartPersonId ? (
                <Pill tone="amber">
                  {shareholderUseStatus(shareholder) === "rented"
                    ? "المستأجر"
                    : shareholderUseStatus(shareholder) === "sold"
                      ? "المالك الجديد"
                      : "المتنازل له"}
                  : {personName(state, shareholder.counterpartPersonId)}
                  {shareholder.counterpartPhone ? ` — ${shareholder.counterpartPhone}` : ""}
                </Pill>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div>
                <div className="text-gray-400">الوحدات</div>
                <div className="font-extrabold text-gray-800 dark:text-white">
                  {formatNumber(shareholder.units)} {pump.shareUnit}
                </div>
              </div>
              <div>
                <div className="text-gray-400">الساعات الأساسية</div>
                <div className="font-extrabold text-gray-800 dark:text-white">
                  {shareholder.baseHoursMin > 0 ? `${shareholder.baseHoursMin / 60} س` : "تُحسب بالحصص"}
                </div>
              </div>
              <div>
                <div className="text-gray-400">ترتيب الدور</div>
                <div className="font-extrabold text-gray-800 dark:text-white">{shareholder.baseOrder + 1}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setShareModal(true)}
                className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-slate-800"
              >
                <UserCog size={12} className="inline -mt-0.5" /> تعديل السهم
              </button>
              <button
                onClick={() => setRightModal(true)}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white"
              >
                <ArrowLeftRight size={12} className="inline -mt-0.5" /> عملية حق جديدة
              </button>
              {activeRight ? (
                <button
                  onClick={() => setEndRightId(activeRight.id)}
                  className="rounded-xl bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  إنهاء الحق الحالي
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-emerald-700 dark:text-emerald-300">
              المساهم الأساسي لا يعني أنه المستخدم الفعلي للماء — الحق والاستخدام يُسجَّلان بشكل مستقل.
            </p>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setShareModal(true)}>
            <Coins size={16} /> تسجيله كمساهم أساسي في المضخة
          </Button>
        )}

        {shareholder ? (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <History size={14} className="text-emerald-600" />
              <span className="text-xs font-extrabold text-gray-700 dark:text-slate-200">
                تاريخ الحقوق والتحويلات
              </span>
            </div>
            {rights.length === 0 ? (
              <p className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:bg-slate-700">
                لا توجد تحويلات — السهم بيد المساهم الأساسي.
              </p>
            ) : (
              <div className="space-y-2">
                {rights
                  .slice()
                  .reverse()
                  .map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-gray-100 px-3 py-2 text-[11px] dark:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <Pill tone={r.status === "active" ? "green" : r.status === "ended" ? "gray" : "red"}>
                          {RIGHT_KINDS.find((k) => k.id === r.kind)?.label ?? r.kind}
                        </Pill>
                        <span className="font-bold text-gray-700 dark:text-slate-200">
                          {personName(state, r.fromPersonId)} → {personName(state, r.holderPersonId)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-gray-400">
                        <span className="flex items-center gap-1">
                          <CalendarRange size={11} /> {isoToShort(r.startedAt)} ←{" "}
                          {r.endedAt ? isoToShort(r.endedAt) : "مستمر"}
                        </span>
                        {r.amount > 0 ? <span>قيمة الاتفاق: {formatNumber(r.amount)}</span> : null}
                        {r.hoursMin > 0 ? <span>{r.hoursMin / 60} ساعة</span> : null}
                      </div>
                      {r.notes ? <div className="mt-1 text-[10px] text-gray-400">{r.notes}</div> : null}
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex-1" onClick={onEdit}>
            تعديل البيانات
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              actions.archivePerson(person.id, true);
              onClose();
            }}
          >
            <Trash2 size={16} /> أرشفة
          </Button>
        </div>
        <p className="text-[10px] text-gray-400">
          الأرشفة حذف ناعم — لا تُفقد أي سجلات تاريخية أو مالية.
        </p>
      </div>

      {shareModal ? (
        <ShareModal
          shareholder={shareholder}
          personId={person.id}
          onClose={() => setShareModal(false)}
        />
      ) : null}
      {rightModal && shareholder ? (
        <RightModal
          shareholder={shareholder}
          onClose={() => setRightModal(false)}
        />
      ) : null}
      {endRightId ? (
        <EndRightModal rightId={endRightId} onClose={() => setEndRightId(null)} />
      ) : null}
    </Modal>
  );
}

function personName(state: ReturnType<typeof useApp>["state"], id: string | null): string {
  return findPerson(state, id)?.name ?? "المساهم الأساسي";
}

function ShareModal({
  shareholder,
  personId,
  onClose,
}: {
  shareholder: Shareholder | null;
  personId: string;
  onClose: () => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [units, setUnits] = useState(shareholder?.units ?? 1);
  const [baseHours, setBaseHours] = useState((shareholder?.baseHoursMin ?? 0) / 60);
  const [order, setOrder] = useState(
    shareholder?.baseOrder ?? activeShareholders(state, pump.id).length
  );
  const [notes, setNotes] = useState(shareholder?.notes ?? "");

  return (
    <Modal open onClose={onClose} title={shareholder ? "تعديل السهم" : "تسجيل مساهم أساسي"}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`عدد الحصص (${pump.shareUnit})`}>
            <NumberInput value={units} onChange={(e) => setUnits(Number(e.target.value))} />
          </Field>
          <Field label="الساعات الأساسية" hint="اتركها 0 ليُحسب تلقائيًا من الحصص">
            <NumberInput value={baseHours} onChange={(e) => setBaseHours(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="ترتيب الدور الأساسي" hint="الجدول الأساسي مرجعي فقط، ولا يفرض ترتيب اليوم الفعلي">
          <NumberInput value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Button
          className="w-full"
          onClick={() => {
            const next: Shareholder = {
              id: shareholder?.id ?? uid("sh"),
              pumpId: pump.id,
              personId: shareholder?.personId ?? personId,
              shareNo: shareholder?.shareNo ?? activeShareholders(state, pump.id).length + 1,
              units,
              baseHoursMin: Math.round(baseHours * 60),
              baseOrder: order,
              startDate: shareholder?.startDate ?? todayISO(),
              endDate: shareholder?.endDate ?? null,
              status: shareholder?.status ?? "active",
              useStatus: shareholder?.useStatus ?? "continuing",
              counterpartPersonId: shareholder?.counterpartPersonId ?? null,
              counterpartPhone: shareholder?.counterpartPhone ?? "",
              useStatusAt: shareholder?.useStatusAt ?? "",
              useStatusNote: shareholder?.useStatusNote ?? "",
              notes,
              archived: shareholder?.archived ?? false,
              createdAt: shareholder?.createdAt ?? new Date().toISOString(),
            };
            actions.saveShareholder(next, !shareholder);
            onClose();
          }}
        >
          حفظ
        </Button>
      </div>
    </Modal>
  );
}

function RightModal({ shareholder, onClose }: { shareholder: Shareholder; onClose: () => void }) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const existing = currentRight(state, shareholder.id);
  const [kind, setKind] = useState<RightKind>("rent");
  const [holderId, setHolderId] = useState(existing?.holderPersonId ?? shareholder.personId);
  const [hours, setHours] = useState(((existing?.hoursMin ?? shareholder.baseHoursMin) || 0) / 60);
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [agreement, setAgreement] = useState("");
  const [startedAt, setStartedAt] = useState(todayISO());
  const [endedAt, setEndedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [endPrevious, setEndPrevious] = useState(true);
  const [picking, setPicking] = useState(false);

  return (
    <Modal open onClose={onClose} title="عملية حق جديدة">
      <div className="space-y-3">
        <Field label="نوع العلاقة">
          <Select value={kind} onChange={(e) => setKind(e.target.value as RightKind)}>
            {RIGHT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="صاحب الحق بعد العملية">
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {personName(state, holderId)}
          </button>
        </Field>

        <div className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] dark:bg-slate-700">
          <div className="font-bold text-gray-600 dark:text-slate-200">
            السلسلة: {existing ? personName(state, existing.holderPersonId) : personName(state, shareholder.personId)} →{" "}
            {personName(state, holderId)}
          </div>
          <div className="mt-1 text-gray-400">
            المساهم الأساسي يبقى {personName(state, shareholder.personId)} — لا يُستبدل السجل القديم.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ البداية">
            <TextInput type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </Field>
          <Field label="تاريخ النهاية (اختياري)">
            <TextInput type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="عدد الساعات المحوّلة" hint="0 = كل السهم">
            <NumberInput value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </Field>
          <Field label="قيمة الاتفاق (اختياري)">
            <NumberInput value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="وصف الاتفاق">
          <TextInput
            value={agreement}
            onChange={(e) => setAgreement(e.target.value)}
            placeholder="مثال: تأجير سنة كاملة"
          />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        {existing ? (
          <label className="flex items-center justify-between rounded-2xl bg-amber-50 px-3 py-3 dark:bg-amber-900/20">
            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
              إنهاء الحق الحالي ({personName(state, existing.holderPersonId)}) عند تاريخ البداية
            </span>
            <input
              type="checkbox"
              checked={endPrevious}
              onChange={(e) => setEndPrevious(e.target.checked)}
              className="h-5 w-5 accent-emerald-600"
            />
          </label>
        ) : null}

        <Button
          className="w-full"
          onClick={() => {
            const right: ShareRight = {
              id: uid("rt"),
              pumpId: pump.id,
              shareholderId: shareholder.id,
              fromPersonId: existing?.holderPersonId ?? shareholder.personId,
              holderPersonId: holderId,
              kind,
              hoursMin: Math.round(hours * 60),
              amount,
              agreement,
              startedAt,
              endedAt: endedAt || null,
              toPumpId: null,
              status: "active",
              notes,
              parentId: existing?.id ?? null,
              createdAt: new Date().toISOString(),
              createdBy: "manager",
            };
            actions.addRight(right, endPrevious);
            onClose();
          }}
          disabled={!holderId}
        >
          تسجيل العملية
        </Button>
        <p className="text-[10px] leading-relaxed text-gray-400">
          كل عملية تُسجَّل كحدث مستقل مع تاريخها — لا تُستبدل العمليات القديمة، ولا تنتقل الديون القديمة تلقائيًا
          لصاحب الحق الجديد.
        </p>
      </div>

      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(false)}
          pumpId={pump.id}
          title="اختيار صاحب الحق"
          onSelect={(p) => setHolderId(p.id)}
        />
      ) : null}
    </Modal>
  );
}

function EndRightModal({ rightId, onClose }: { rightId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const right = state.rights.find((r) => r.id === rightId);
  const [endedAt, setEndedAt] = useState(right?.endedAt ?? todayISO());
  const [reason, setReason] = useState("انتهاء فترة التأجير");

  if (!right) return null;
  return (
    <Modal open onClose={onClose} title="إنهاء الحق">
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-gray-600 dark:text-slate-300">
          ينتهي حق <b>{personName(state, right.holderPersonId)}</b> ويعود السهم تلقائيًا إلى المساهم الأساسي{" "}
          <b>{personName(state, right.fromPersonId)}</b> بدءًا من تاريخ الإنهاء.
        </p>
        <Field label="تاريخ الإنهاء">
          <TextInput type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
        </Field>
        <Field label="السبب">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button
          className="w-full"
          onClick={() => {
            actions.endRight(right.id, endedAt, reason, "manager");
            onClose();
          }}
        >
          تأكيد الإنهاء
        </Button>
      </div>
    </Modal>
  );
}
