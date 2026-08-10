"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCrmPipeline } from "@/contexts/crm-pipeline-context";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  PIPELINE_ACCENTS,
  type PipelineAccentKey,
  type PipelineStatusDef,
} from "@/lib/crm-pipeline-config";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, Columns3 } from "lucide-react";

const ACCENT_OPTIONS = Object.keys(PIPELINE_ACCENTS) as PipelineAccentKey[];

export function PipelineSettingsClient() {
  const {
    statuses,
    loading,
    addCustomStatus,
    updateStatus,
    removeCustomStatus,
    reorderStatuses,
  } = useCrmPipeline();
  const { leads, updateLeadStatus } = useCrmLeads();
  const { user } = useAuth();
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [newAccent, setNewAccent] = useState<PipelineAccentKey>("cyan");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<PipelineStatusDef | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAccent, setEditAccent] = useState<PipelineAccentKey>("slate");
  const [editHidden, setEditHidden] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState("2");

  const [deleting, setDeleting] = useState<PipelineStatusDef | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");

  const leadCountByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      map.set(l.status, (map.get(l.status) || 0) + 1);
    }
    return map;
  }, [leads]);

  function openEdit(s: PipelineStatusDef) {
    setEditing(s);
    setEditLabel(s.label);
    setEditAccent(s.accentKey || "slate");
    setEditHidden(Boolean(s.hidden));
    setEditFollowUp(
      s.followUpDays === null || s.followUpDays === undefined ? "" : String(s.followUpDays)
    );
  }

  function openDelete(s: PipelineStatusDef) {
    setDeleting(s);
    const fallback = statuses.find((x) => x.id !== s.id && !x.hidden)?.id || statuses.find((x) => x.id !== s.id)?.id || "";
    setReassignTo(fallback);
  }

  async function handleAdd() {
    setBusy(true);
    try {
      await addCustomStatus({ label: newLabel, accentKey: newAccent });
      setNewLabel("");
      toast({ title: "Status added", description: "It appears on the Leads board and status lists." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not add status",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const label = editLabel.trim();
    if (!label) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    setBusy(true);
    try {
      const followUpDays =
        editFollowUp.trim() === ""
          ? editing.kind === "won" || editing.kind === "lost"
            ? null
            : 2
          : Number(editFollowUp);
      await updateStatus(editing.id, {
        label,
        accentKey: editAccent,
        hidden: editHidden,
        followUpDays: Number.isFinite(followUpDays as number) ? (followUpDays as number) : null,
      });
      toast({ title: "Status updated" });
      setEditing(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not update status",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = statuses.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy(true);
    try {
      await reorderStatuses(next);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not reorder",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    const count = leadCountByStatus.get(deleting.id) || 0;

    // Default/system statuses: hide instead of hard-delete (preserves history).
    if (deleting.isSystem) {
      setBusy(true);
      try {
        if (count > 0 && reassignTo && reassignTo !== deleting.id && user?.uid) {
          const toMove = leads.filter((l) => l.status === deleting.id);
          for (const lead of toMove) {
            await updateLeadStatus(lead.id, reassignTo, user.uid);
          }
        }
        await updateStatus(deleting.id, { hidden: true });
        toast({
          title: "Default status hidden",
          description:
            count > 0 && reassignTo
              ? `${count} lead(s) moved to another status, then this column was hidden.`
              : "Default stages cannot be permanently deleted — this one is hidden from the board.",
        });
        setDeleting(null);
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Could not hide status",
          description: e instanceof Error ? e.message : "Try again",
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (count > 0 && (!reassignTo || reassignTo === deleting.id)) {
      toast({
        variant: "destructive",
        title: "Choose where to move leads",
        description: `${count} lead(s) use this status. Pick another status before deleting.`,
      });
      return;
    }

    setBusy(true);
    try {
      if (count > 0 && user?.uid) {
        const toMove = leads.filter((l) => l.status === deleting.id);
        for (const lead of toMove) {
          await updateLeadStatus(lead.id, reassignTo, user.uid);
        }
      }
      await removeCustomStatus(deleting.id);
      toast({
        title: "Status deleted",
        description: count > 0 ? `${count} lead(s) were moved first.` : undefined,
      });
      setDeleting(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not delete",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  }

  const deleteLeadCount = deleting ? leadCountByStatus.get(deleting.id) || 0 : 0;
  const reassignOptions = statuses.filter((s) => s.id !== deleting?.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Columns3 className="h-6 w-6" />
          Pipeline statuses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add custom stages, edit any status, or delete custom ones. Default stages can be edited or hidden.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add custom status</CardTitle>
          <CardDescription>Creates a new Kanban column and status option everywhere leads are edited.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-status-label">Name</Label>
            <Input
              id="new-status-label"
              placeholder="e.g. Demo booked"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={busy || loading}
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label>Color</Label>
            <Select value={newAccent} onValueChange={(v) => setNewAccent(v as PipelineAccentKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENT_OPTIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    <span className="inline-flex items-center gap-2 capitalize">
                      <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${PIPELINE_ACCENTS[key].bar}`} />
                      {key}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void handleAdd()} disabled={busy || loading || !newLabel.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Board columns</CardTitle>
          <CardDescription>Use Edit or Delete on each row. Reorder with the arrows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            statuses.map((s, index) => {
              const accent = PIPELINE_ACCENTS[s.accentKey || "slate"];
              const count = leadCountByStatus.get(s.id) || 0;
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card/40 p-3 sm:flex-row sm:items-center"
                >
                  <div className={`h-1.5 w-full rounded-full bg-gradient-to-r sm:h-10 sm:w-1.5 ${accent.bar}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{s.label}</p>
                      {s.isSystem ? <Badge variant="secondary">Default</Badge> : <Badge>Custom</Badge>}
                      {s.hidden ? <Badge variant="outline">Hidden</Badge> : null}
                      <span className="text-xs text-muted-foreground">
                        {count} lead{count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">id: {s.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => openDelete(s)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {s.isSystem ? "Hide / remove" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={busy || index === 0}
                      onClick={() => void move(s.id, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={busy || index === statuses.length - 1}
                      onClick={() => void move(s.id, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit status</DialogTitle>
            <DialogDescription>
              {editing?.isSystem
                ? "Rename, recolor, or hide this default stage."
                : "Update this custom pipeline stage."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-status-label">Name</Label>
              <Input
                id="edit-status-label"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Select value={editAccent} onValueChange={(v) => setEditAccent(v as PipelineAccentKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCENT_OPTIONS.map((key) => (
                    <SelectItem key={key} value={key}>
                      <span className="inline-flex items-center gap-2 capitalize">
                        <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${PIPELINE_ACCENTS[key].bar}`} />
                        {key}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editing?.kind === "open" ? (
              <div className="space-y-1.5">
                <Label htmlFor="edit-follow-up">Follow-up days</Label>
                <Input
                  id="edit-follow-up"
                  type="number"
                  min={0}
                  placeholder="2"
                  value={editFollowUp}
                  onChange={(e) => setEditFollowUp(e.target.value)}
                  disabled={busy}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Show on board</p>
                <p className="text-xs text-muted-foreground">Hidden statuses stay on existing leads.</p>
              </div>
              <Switch checked={!editHidden} onCheckedChange={(checked) => setEditHidden(!checked)} disabled={busy} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveEdit()} disabled={busy || !editLabel.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.isSystem ? `Hide “${deleting?.label}”?` : `Delete “${deleting?.label}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {deleting?.isSystem ? (
                  <p>
                    Default statuses cannot be permanently deleted. This will hide the column from the board
                    {deleteLeadCount > 0 ? " after moving its leads" : ""}.
                  </p>
                ) : (
                  <p>This removes the status from your pipeline{deleteLeadCount > 0 ? " after moving its leads" : ""}.</p>
                )}
                {deleteLeadCount > 0 ? (
                  <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-foreground">
                    <p className="text-sm font-medium">
                      {deleteLeadCount} lead{deleteLeadCount === 1 ? "" : "s"} currently in this status — move to:
                    </p>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {reassignOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy || (deleteLeadCount > 0 && !reassignTo)}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {deleting?.isSystem ? "Hide status" : "Delete status"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
