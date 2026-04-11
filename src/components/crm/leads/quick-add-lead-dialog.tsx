"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import { useToast } from "@/hooks/use-toast";
import { PLATFORM_SOURCES, PLATFORM_LABELS, type PlatformSource } from "@/lib/crm-lead-schema";
import { Plus, Loader2 } from "lucide-react";

const schema = z.object({
  leadName: z.string().min(1, "Name is required").max(200),
  company: z.string().max(200).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal("")),
  websiteUrl: z.string().max(2000).optional().or(z.literal("")),
  platformSource: z
    .string()
    .refine((v): v is PlatformSource => (PLATFORM_SOURCES as readonly string[]).includes(v), {
      message: "Invalid source",
    }),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function QuickAddLeadDialog() {
  const [open, setOpen] = useState(false);
  const { createLead } = useCrmLeads();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leadName: "",
      company: "",
      email: "",
      phone: "",
      websiteUrl: "",
      platformSource: "other",
      notes: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      await createLead({
        leadName: values.leadName.trim(),
        company: values.company?.trim() || undefined,
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        websiteUrl: values.websiteUrl?.trim() || undefined,
        platformSource: values.platformSource,
        notes: values.notes?.trim() || undefined,
      });
      toast({ title: "Lead added" });
      form.reset({
        leadName: "",
        company: "",
        email: "",
        phone: "",
        websiteUrl: "",
        platformSource: "other",
        notes: "",
      });
      setOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not add lead",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary/85 px-4 shadow-md shadow-primary/25 transition hover:from-primary/95 hover:to-primary/75 hover:shadow-lg hover:shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          Quick add lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,760px)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>Add in under a minute. More fields are available in the lead detail panel.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="leadName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Smith" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company name</FormLabel>
                  <FormControl>
                    <Input placeholder="optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone / WhatsApp</FormLabel>
                  <FormControl>
                    <Input placeholder="optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="websiteUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website / URL</FormLabel>
                  <FormControl>
                    <Input inputMode="url" autoComplete="url" placeholder="https://… (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="platformSource"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PLATFORM_SOURCES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PLATFORM_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="First message or context…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save lead"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
