import Link from "next/link";

type Person = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  source: string | null;
  updatedAt: Date | string;
};

export function PeopleList({ people }: { people: Person[] }) {
  if (people.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-base">No people found</p>
        <p className="text-sm mt-1">
          Add someone using the voice note shortcut or the button above
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            href={`/person/${person.id}`}
            className="flex items-center justify-between py-3 px-1 -mx-1 rounded-md hover:bg-muted transition-colors"
          >
            <div className="min-w-0 flex-1 px-2">
              <p className="font-medium text-sm truncate">{person.name}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {[person.role, person.company].filter(Boolean).join(" at ") ||
                  person.source ||
                  "No details"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0 ml-4">
              {new Date(person.updatedAt).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
