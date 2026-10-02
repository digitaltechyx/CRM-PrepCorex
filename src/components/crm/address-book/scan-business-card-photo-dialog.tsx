"use client";

import { useEffect, useRef, useState } from "react";
import { createWorker, type Worker } from "tesseract.js";
import { Camera, ImageIcon, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseBusinessCardOcrText, type ParsedBusinessCardQr } from "@/lib/business-card-qr-parse";
import type { AddressBookSeed } from "@/lib/crm-address-book";

type ScanBusinessCardPhotoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (seed: AddressBookSeed) => Promise<void>;
};

type FormState = {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  whatsappId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
};

/** Common packs for in-browser OCR. First run downloads language data. */
const OCR_LANGS: { value: string; label: string }[] = [
  { value: "eng", label: "English" },
  { value: "eng+ara", label: "English + Arabic" },
  { value: "eng+urd", label: "English + Urdu" },
  { value: "eng+chi_sim", label: "English + Chinese (Simplified)" },
  { value: "eng+spa", label: "English + Spanish" },
  { value: "eng+fra", label: "English + French" },
  { value: "eng+deu", label: "English + German" },
  { value: "eng+hin", label: "English + Hindi" },
];

function seedToForm(seed: AddressBookSeed): FormState {
  return {
    fullName: seed.fullName || "",
    company: seed.company || "",
    email: seed.email || "",
    phone: seed.phone || "",
    whatsappId: seed.whatsappId || "",
    address: seed.address || "",
    city: seed.city || "",
    state: seed.state || "",
    zip: seed.zip || "",
    country: seed.country || "",
    notes: seed.notes || "",
  };
}

function formToSeed(form: FormState): AddressBookSeed {
  return {
    fullName: form.fullName.trim(),
    company: form.company.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    whatsappId: form.whatsappId.trim() || undefined,
    address: form.address.trim() || undefined,
    city: form.city.trim() || undefined,
    state: form.state.trim() || undefined,
    zip: form.zip.trim() || undefined,
    country: form.country.trim() || undefined,
    notes: form.notes.trim() || undefined,
    source: "b_card",
  };
}

export function ScanBusinessCardPhotoDialog({
  open,
  onOpenChange,
  onSave,
}: ScanBusinessCardPhotoDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerLangRef = useRef<string>("");

  const [lang, setLang] = useState("eng");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [runningOcr, setRunningOcr] = useState(false);
  const [parsed, setParsed] = useState<ParsedBusinessCardQr | null>(null);
  const [form, setForm] = useState<FormState>(seedToForm({ fullName: "", source: "b_card" }));
  const [saving, setSaving] = useState(false);

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setParsed(null);
      setCameraError(null);
      setOcrProgress(null);
      setRunningOcr(false);
      return;
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open/close
  }, [open]);

  useEffect(() => {
    return () => {
      void workerRef.current?.terminate();
      workerRef.current = null;
      workerLangRef.current = "";
    };
  }, []);

  async function ensureWorker(selectedLang: string): Promise<Worker> {
    if (workerRef.current && workerLangRef.current === selectedLang) {
      return workerRef.current;
    }
    if (workerRef.current) {
      await workerRef.current.terminate();
      workerRef.current = null;
      workerLangRef.current = "";
    }
    setOcrProgress("Loading OCR language data (first time can take a minute)…");
    const worker = await createWorker(selectedLang, undefined, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          setOcrProgress(`Reading card… ${Math.round(m.progress * 100)}%`);
        } else if (m.status) {
          setOcrProgress(String(m.status).replace(/_/g, " "));
        }
      },
    });
    workerRef.current = worker;
    workerLangRef.current = selectedLang;
    return worker;
  }

  async function startCamera() {
    setCameraError(null);
    setParsed(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Camera unavailable.");
      setCameraOn(false);
    }
  }

  function captureFromCamera() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    stopCamera();
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        void runOcr(blob);
      },
      "image/jpeg",
      0.92
    );
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    stopCamera();
    setParsed(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    await runOcr(file);
  }

  async function runOcr(image: Blob | File) {
    setRunningOcr(true);
    setOcrProgress("Starting OCR…");
    try {
      const worker = await ensureWorker(lang);
      setOcrProgress("Reading card…");
      const result = await worker.recognize(image);
      const text = String(result.data.text || "").trim();
      if (!text) {
        setOcrProgress(null);
        setCameraError("No text detected. Try a clearer photo, better light, or another language pack.");
        return;
      }
      const next = parseBusinessCardOcrText(text);
      setParsed(next);
      setForm(seedToForm(next.seed));
      setCameraError(null);
      setOcrProgress(null);
    } catch (err) {
      console.error(err);
      setCameraError(err instanceof Error ? err.message : "OCR failed.");
      setOcrProgress(null);
    } finally {
      setRunningOcr(false);
    }
  }

  async function handleSave() {
    const seed = formToSeed(form);
    if (!seed.fullName && !seed.email && !seed.phone && !seed.whatsappId && !seed.notes) {
      return;
    }
    if (!seed.fullName) {
      seed.fullName = seed.email || seed.phone || seed.whatsappId || "Business card contact";
    }
    setSaving(true);
    try {
      await onSave(seed);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Scan business card photo
          </DialogTitle>
          <DialogDescription>
            Take or upload a photo of a printed card. In-browser OCR extracts text (pick a language
            pack for non-English cards). Review before saving — stored under B-Card.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>OCR language</Label>
              <Select value={lang} onValueChange={setLang} disabled={runningOcr}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCR_LANGS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                First use downloads language data in the browser. Start with English; add another pack
                if the card is mostly in that language.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border bg-muted aspect-[4/3]">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Card preview" className="h-full w-full object-contain bg-black" />
              ) : (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
              )}
              {!previewUrl && !cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white/90 px-4 text-center">
                  {cameraError || "Start camera or upload a card photo"}
                </div>
              )}
              {runningOcr && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white px-4 text-center">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">{ocrProgress || "Reading…"}</p>
                </div>
              )}
            </div>

            {cameraError && !runningOcr ? (
              <p className="text-sm text-destructive">{cameraError}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void startCamera()}
                disabled={runningOcr}
              >
                <Camera className="mr-2 h-4 w-4" />
                Start camera
              </Button>
              {cameraOn ? (
                <Button type="button" size="sm" onClick={captureFromCamera} disabled={runningOcr}>
                  Capture &amp; OCR
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={runningOcr}
                onClick={() => document.getElementById("bcard-photo-upload")?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload photo
              </Button>
              <input
                id="bcard-photo-upload"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void onFileSelected(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {previewUrl && !runningOcr ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // Re-run on current preview blob via fetch
                    void (async () => {
                      const res = await fetch(previewUrl);
                      const blob = await res.blob();
                      await runOcr(blob);
                    })();
                  }}
                >
                  Re-run OCR
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              OCR finished — check fields below. Full text is kept in Notes.
            </p>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Scanned card"
                className="max-h-40 w-full rounded-lg border object-contain bg-black"
              />
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>WhatsApp ID</Label>
                <Input
                  value={form.whatsappId}
                  onChange={(e) => setForm((p) => ({ ...p, whatsappId: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                />
              </div>
              <div>
                <Label>Zip</Label>
                <Input
                  value={form.zip}
                  onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
                />
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Notes (full OCR text)</Label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setParsed(null);
                setCameraError(null);
              }}
            >
              Scan another photo
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {parsed ? (
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save to address book
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
