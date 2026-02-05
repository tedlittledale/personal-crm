import Link from "next/link";
import { PersonForm } from "@/components/person-form";

export default function NewPersonPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          People
        </Link>
        <span>/</span>
        <span className="text-foreground">New</span>
      </div>
      <h1 className="text-lg font-semibold">Add a person</h1>
      <PersonForm mode="create" />
    </div>
  );
}
