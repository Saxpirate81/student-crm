import { ParentSessionGate } from "@/components/ParentSessionGate";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <ParentSessionGate>{children}</ParentSessionGate>;
}
