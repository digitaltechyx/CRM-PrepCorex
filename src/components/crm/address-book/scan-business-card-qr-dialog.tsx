"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Loader2, ScanLine, Upload } from "lucide-react";
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
import { parseBusinessCardQr, type ParsedBusinessCardQr } from "@/lib/business-card-qr-parse";
import type { AddressBookSeed } from "@/lib/crm-address-book";

type ScanBusinessCardQrDialogProps = {
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

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function getBarcodeDetector(): BarcodeDetectorLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function ScanBusinessCardQrDialog({
  open,
  onOpenChange,
  onSave,
}: ScanBusinessCardQrDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const handledRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBusinessCardQr | null>(null);
  const [form, setForm] = useState<FormState>(seedToForm({ fullName: "", source: "b_card" }));
  const [saving, setSaving] = useState(false);
  const [manualRaw, setManualRaw] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  }, []);

  const applyParsed = useCallback((result: ParsedBusinessCardQr) => {
    if (result.kind === "empty") return;
    handledRef.current = true;
    stopCamera();
    setParsed(result);
    setForm(seedToForm(result.seed));
  }, [stopCamera]);

  const decodeImageData = useCallback(
    (imageData: ImageData) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) applyParsed(parseBusinessCardQr(code.data));
    },
    [applyParsed]
  );

  const tick = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || handledRef.current) {
      rafRef.current = requestAnimationFrame(() => void tick());
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w < 32 || h < 32) {
      rafRef.current = requestAnimationFrame(() => void tick());
      return;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(() => void tick());
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);

    try {
      if (detectorRef.current) {
        const codes = await detectorRef.current.detect(canvas);
        const value = codes[0]?.rawValue;
        if (value) {
          applyParsed(parseBusinessCardQr(value));
          return;
        }
      } else {
        decodeImageData(ctx.getImageData(0, 0, w, h));
        if (handledRef.current) return;
      }
    } catch {
      // Keep scanning.
    }

    rafRef.current = requestAnimationFrame(() => void tick());
  }, [applyParsed, decodeImageData]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    handledRef.current = false;
    setParsed(null);
    detectorRef.current = getBarcodeDetector();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Camera permission denied or unavailable.";
      setCameraError(message);
      setScanning(false);
    }
  }, [tick]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setParsed(null);
      setCameraError(null);
      setManualRaw("");
      handledRef.current = false;
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  async function onFileSelected(file: File | null) {
    if (!file) return;
    handledRef.current = false;
    const bitmap = await createImageBitmap(file);
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    const detector = getBarcodeDetector();
    if (detector) {
      try {
        const codes = await detector.detect(canvas);
        const value = codes[0]?.rawValue;
        if (value) {
          applyParsed(parseBusinessCardQr(value));
          return;
        }
      } catch {
        // fall through to jsQR
      }
    }
    decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!handledRef.current) {
      setCameraError("No QR code found in that image. Try again or paste the QR text.");
    }
  }

  async function handleSave() {
    const seed = formToSeed(form);
    if (
      !seed.fullName &&
      !seed.email &&
      !seed.phone &&
      !seed.whatsappId &&
      !seed.notes
    ) {
      return;
    }
    // Ensure name exists for match key / display.
    if (!seed.fullName) {
      seed.fullName = seed.email || seed.phone || seed.whatsappId || "QR contact";
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
            <ScanLine className="h-5 w-5" />
            Scan business card QR
          </DialogTitle>
          <DialogDescription>
            Point the camera at any contact QR (vCard, WhatsApp, phone, email, or link). Everything in
            the QR is saved to the address book under B-Card.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
              />
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white/90 px-4 text-center">
                  {cameraError || "Starting camera…"}
                </div>
              )}
              <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-orange-400/80" />
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void startCamera()}>
                <Camera className="mr-2 h-4 w-4" />
                Retry camera
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("bcard-qr-upload")?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload QR image
              </Button>
              <input
                id="bcard-qr-upload"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void onFileSelected(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Or paste QR text / link</Label>
              <div className="flex gap-2">
                <Input
                  value={manualRaw}
                  onChange={(e) => setManualRaw(e.target.value)}
                  placeholder="BEGIN:VCARD… / https://wa.me/… / mailto:… / tel:…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applyParsed(parseBusinessCardQr(manualRaw))}
                  disabled={!manualRaw.trim()}
                >
                  Parse
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Detected: <span className="font-medium text-foreground">{parsed.kind}</span>
              {parsed.website ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={parsed.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-600 underline-offset-2 hover:underline"
                  >
                    open link
                  </a>
                </>
              ) : null}
            </p>
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
                <Label>Notes (includes full QR content)</Label>
                <textarea
                  className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                handledRef.current = false;
                void startCamera();
              }}
            >
              Scan another
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
