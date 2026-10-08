"use client";
import { AuthPanel } from "@/components/AuthPanel";
import { useRouter } from "next/navigation";
export default function ResetPassword() { const router = useRouter(); return <AuthPanel reset onAuthenticated={() => router.push("/")} />; }
