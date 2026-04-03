"use client";

import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { Logo } from "@/components/logo";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Loader2 } from "lucide-react";
import type { UserProfile } from "@/types";
import { canAccessCrm } from "@/lib/crm-access";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export default function CrmLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const authBg = PlaceHolderImages.find((p) => p.id === "auth-background");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        toast({
          variant: "destructive",
          title: "No profile",
          description: "Your account profile was not found.",
        });
        await signOut(auth);
        return;
      }

      const userProfile = userDoc.data() as UserProfile;
      const userStatus = userProfile.status || "approved";

      if (userStatus === "deleted") {
        toast({
          variant: "destructive",
          title: "Account deleted",
          description: "Contact an administrator.",
        });
        await signOut(auth);
        return;
      }

      if (userStatus === "pending") {
        toast({
          variant: "destructive",
          title: "Pending approval",
          description: "Your account is not approved yet.",
        });
        await signOut(auth);
        return;
      }

      if (!canAccessCrm(userProfile)) {
        toast({
          variant: "destructive",
          title: "No CRM access",
          description: "You need admin or invoice/quote permissions to use this app.",
        });
        await signOut(auth);
        return;
      }

      router.replace("/dashboard");
    } catch (error: unknown) {
      let friendly = "Unable to sign in. Please try again.";
      const code = (error as { code?: string })?.code || "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-login-credentials"
      ) {
        friendly = "Incorrect email or password.";
      }
      toast({ variant: "destructive", title: "Login failed", description: friendly });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <Logo variant="auth" />
            <h1 className="mt-4 font-headline text-3xl font-bold">CRM login</h1>
            <p className="text-sm text-muted-foreground">Quotes, invoices, leads & contacts</p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@company.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        {authBg && (
          <Image
            src={authBg.imageUrl}
            alt="Authentication background"
            fill
            priority
            className="object-cover dark:brightness-[0.7]"
            data-ai-hint={authBg.imageHint}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>
    </div>
  );
}
