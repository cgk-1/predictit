import { useLinkClick } from "../lib/router";

export interface NavItem {
  path: string;
  label: string;
  dot?: boolean;
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const onClick = useLinkClick(item.path);
  return (
    <a
      href={item.path}
      className="rail-link"
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        onClick(e);
        onNavigate?.();
      }}
    >
      <span>{item.label}</span>
      {item.dot ? <span className="rail-link-dot" aria-label="needs attention" /> : null}
    </a>
  );
}

export function Nav({ items, path, onNavigate }: { items: NavItem[]; path: string; onNavigate?: () => void }) {
  return (
    <nav className="rail-nav" aria-label="Views">
      {items.map((it) => (
        <NavLink key={it.path} item={it} active={path === it.path} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
