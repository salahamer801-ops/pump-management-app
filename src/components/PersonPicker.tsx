import { useMemo, useState } from "react";
import { Search, UserPlus, UsersRound } from "lucide-react";
import { useApp } from "../store";
import { suggestPeople, tierLabel } from "../domain/rules";
import type { EntryRole, Person } from "../domain/types";
import { todayISO, uid } from "../domain/util";
import { Button, Field, Modal, TextArea, TextInput, Pill } from "./ui";

const ROLE_OPTIONS: { id: EntryRole; label: string }[] = [
  { id: "shareholder", label: "مساهم أساسي" },
  { id: "right_holder", label: "صاحب حق" },
  { id: "tenant", label: "مستأجر" },
  { id: "guest", label: "ضيف / ليس له سهم" },
  { id: "other", label: "أخرى" },
];

export function roleLabel(role: EntryRole): string {
  return ROLE_OPTIONS.find((r) => r.id === role)?.label ?? "غير محدد";
}

/**
 * البحث + الاقتراحات الذكية + إضافة شخص جديد (§11, §12)
 * ترتيب الاقتراحات لا يعني ترتيب اليوم.
 */
export default function PersonPicker({
  open,
  onClose,
  pumpId,
  onSelect,
  title = "إضافة شخص",
}: {
  open: boolean;
  onClose: () => void;
  pumpId: string;
  onSelect: (person: Person, role: EntryRole) => void;
  title?: string;
}) {
  const { state, actions } = useApp();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [role, setRole] = useState<EntryRole>("shareholder");

  const suggestions = useMemo(
    () => (open ? suggestPeople(state, pumpId, query, 60) : []),
    [open, state, pumpId, query]
  );

  const reset = () => {
    setQuery("");
    setCreating(false);
    setName("");
    setPhone("");
    setNotes("");
    setRole("shareholder");
  };

  const close = () => {
    reset();
    onClose();
  };

  const createPerson = () => {
    if (!name.trim()) return;
    const person: Person = {
      id: uid("pr"),
      name: name.trim(),
      phone: phone.trim(),
      nationalId: "",
      notes: notes.trim(),
      guest: role === "guest",
      archived: false,
      createdAt: todayISO(),
      createdBy: "manager",
    };
    actions.savePerson(person, true);
    onSelect(person, role);
    close();
  };

  return (
    <Modal open={open} onClose={close} title={title}>
      {!creating ? (
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف…"
              className="pr-11"
              autoFocus
              aria-label="بحث عن شخص"
            />
          </div>

          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {suggestions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                لا نتائج مطابقة — يمكنك إضافة شخص جديد.
              </p>
            ) : (
              suggestions.map((s) => (
                <button
                  key={s.person.id}
                  onClick={() => {
                    onSelect(s.person, s.tier === 1 ? "shareholder" : s.tier === 2 && s.tags.includes("مستأجر") ? "tenant" : "other");
                    close();
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3 text-right transition hover:border-emerald-200 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-800"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {s.person.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-800 dark:text-white">
                      {s.person.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-400">
                      {s.person.phone ? `${s.person.phone} · ` : ""}
                      {tierLabel(s.tier)} · {s.tags.join(" / ")}
                    </span>
                  </span>
                  {s.person.guest ? <Pill tone="gray">ضيف</Pill> : null}
                </button>
              ))
            )}
          </div>

          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            <UserPlus size={18} /> إضافة شخص جديد
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-gray-400">
            ظهور الشخص في الاقتراحات لا يعني أنه مساهم أو مدين — الاقتراح لا ينشئ أي علاقة.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="الاسم">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الشخص"
              autoFocus
            />
          </Field>
          <Field label="الهاتف (اختياري)">
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="7XXXXXXXX"
              dir="ltr"
              className="text-left"
            />
          </Field>
          <Field label="نوع العلاقة">
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={
                    "rounded-2xl border px-3 py-2 text-xs font-bold transition " +
                    (role === r.id
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-500 hover:border-emerald-200 dark:border-slate-600")
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="ملاحظات">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            إضافة شخص لا تنشئ سهمًا ولا ملكية ولا دينًا ولا ساعات ثابتة. العلاقات تُسجَّل بشكل صريح فقط.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCreating(false)}>
              رجوع
            </Button>
            <Button className="flex-1" onClick={createPerson} disabled={!name.trim()}>
              <UsersRound size={18} /> إضافة
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
