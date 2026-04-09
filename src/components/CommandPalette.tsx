import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { menuGroups, footerMenu } from "@/config/menuConfig";
import { useAdmin } from "@/contexts/AdminContext";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdmin();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (url: string) => {
      setOpen(false);
      navigate(url);
    },
    [navigate],
  );

  const visibleGroups = menuGroups.filter((group) => {
    const items = group.items.filter(
      (item) => !item.hidden && (!item.adminOnly || isSuperAdmin) && item.url,
    );
    return items.length > 0;
  });

  const visibleFooter = footerMenu.filter(
    (item) => !item.hidden && (!item.adminOnly || isSuperAdmin) && item.url,
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar paginas, acoes..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        {visibleGroups.map((group) => (
          <CommandGroup
            key={group.id}
            heading={group.labelKey || "Principal"}
          >
            {group.items
              .filter(
                (item) =>
                  !item.hidden &&
                  (!item.adminOnly || isSuperAdmin) &&
                  item.url,
              )
              .map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.isHardcoded ? item.titleKey : item.titleKey} ${item.url}`}
                  onSelect={() => handleSelect(item.url!)}
                >
                  <item.icon className="mr-2 h-4 w-4 opacity-60" />
                  <span>
                    {item.isHardcoded ? item.titleKey : item.titleKey}
                  </span>
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
        {visibleFooter.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Outros">
              {visibleFooter.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.titleKey} ${item.url}`}
                  onSelect={() => handleSelect(item.url!)}
                >
                  <item.icon className="mr-2 h-4 w-4 opacity-60" />
                  <span>{item.titleKey}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
