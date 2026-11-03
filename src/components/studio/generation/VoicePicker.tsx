"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, ChevronDownIcon, MicIcon, PlayIcon, SquareIcon } from "lucide-react";
import { CHIP_TRIGGER } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { voicePreviewUrl, type Voice } from "@/lib/generation/voices";

/** Long voice lists (several languages) get a filter above them. */
const FILTER_FROM = 24;

/**
 * Voice choice for a voiceover: a chip in the prompt box beside the model chip. Each voice in the list plays a short
 * sample of itself, so a creator can hear voices before choosing one; one sample plays at a time.
 */
export function VoicePicker({ modelId, voices, value, onChange, copying }: {
  modelId: string; voices: readonly Voice[]; value?: string; onChange: (id: string) => void;
  /** A voice clip is attached: the model speaks in that voice instead. */
  copying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = voices.find(voice => voice.id === value);
  // Several languages share speaker names (Harper, Grant), so the chip says which one.
  const label = current ? current.group ? `${current.name} · ${current.group}` : current.name : "Choose a voice";
  const stop = () => { audio.current?.pause(); setPlaying(null); };
  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => { if (!open) { audio.current?.pause(); setPlaying(null); setFilter(""); } }, [open]);
  const play = (id: string) => {
    if (playing === id) { stop(); return; }
    audio.current?.pause();
    const sample = new Audio(voicePreviewUrl(modelId, id));
    sample.onended = () => setPlaying(now => now === id ? null : now);
    sample.onerror = () => setPlaying(now => now === id ? null : now);
    audio.current = sample; setPlaying(id);
    void sample.play().catch(() => setPlaying(now => now === id ? null : now));
  };
  if (copying) return <span className={cn(CHIP_TRIGGER, "pointer-events-none text-[color:var(--ink-secondary)]")}><MicIcon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">Your clip's voice</span></span>;
  const words = filter.trim().toLowerCase();
  const shown = words ? voices.filter(voice => `${voice.name} ${voice.note ?? ""} ${voice.group ?? ""} ${voice.description ?? ""}`.toLowerCase().includes(words)) : voices;
  const groups = [...new Set(shown.map(voice => voice.group ?? ""))];
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger aria-label={`Voice: ${label}`} className={cn(CHIP_TRIGGER, "min-w-0 text-[color:var(--ink)]")}>
      <MicIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
    </Popover.Trigger>
    <Popover.Portal>
      {/* Opens upward like the other chips: below the prompt sits Generate, which spends credits. */}
      <Popover.Positioner side="top" align="end" sideOffset={6} collisionPadding={8} className="editor-chrome isolate z-(--layer-popover)">
        <Popover.Popup initialFocus={() => list.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]") ?? null}
          className="flex max-h-[min(440px,var(--available-height))] w-[min(320px,calc(100vw-16px))] max-w-[var(--available-width)] flex-col overflow-hidden rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] text-[var(--ink)] shadow-xl outline-none">
          {voices.length >= FILTER_FROM ? <div className="border-b border-[var(--edge-outline)] p-1.5">
            <Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Find a voice, accent or style" aria-label="Find a voice" className="h-8 text-sm" />
          </div> : null}
          <div ref={list} role="group" aria-label="Voices" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden p-1"
            onKeyDown={event => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-voice]") ?? [])];
              const at = items.indexOf(document.activeElement as HTMLButtonElement);
              event.preventDefault();
              items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }}>
            {!shown.length ? <p className="px-2 py-3 text-sm text-[var(--ink-muted)]">No voices match</p> : null}
            {groups.map(group => <section key={group}>
              {group ? <h4 className="px-2 pb-0.5 pt-1.5 text-xs font-medium text-[var(--ink-muted)]">{group}</h4> : null}
              {shown.filter(voice => (voice.group ?? "") === group).map(voice => <div key={voice.id} className="flex min-w-0 items-center rounded-md hover:bg-[var(--chrome-raised)] has-[[aria-pressed=true]]:bg-[var(--chrome-selected-bg)]">
                <button type="button" aria-label={playing === voice.id ? `Stop ${voice.name}` : `Play ${voice.name}`} onClick={() => play(voice.id)}
                  className="mx-0.5 grid size-7 shrink-0 place-items-center rounded-md text-[var(--ink-secondary)] outline-none hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35">
                  {playing === voice.id ? <SquareIcon aria-hidden="true" className="size-3 fill-current" /> : <PlayIcon aria-hidden="true" className="size-3.5" />}
                </button>
                <button type="button" data-voice={voice.id} aria-pressed={voice.id === value} onClick={() => { onChange(voice.id); setOpen(false); }}
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-2 text-left text-sm text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35">
                  {/* The provider's description, so voices can be compared by reading; the sample confirms it. */}
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{voice.name}</span>
                    {voice.description ?? voice.note ? <span className="truncate text-xs text-[var(--ink-muted)]">{voice.description ?? voice.note}</span> : null}
                  </span>
                  {voice.id === value ? <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
                </button>
              </div>)}
            </section>)}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
