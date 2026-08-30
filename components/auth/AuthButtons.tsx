'use client';

// Header authentication UI.
//
// Two shapes share one component so the desktop header and the mobile drawer
// can never disagree about whether the visitor is signed in:
//   - variant="desktop": the pill buttons / avatar menu in the top bar
//   - variant="mobile" : the block at the bottom of the slide-out drawer

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutDashboard, LogOut, Settings, UserRound } from 'lucide-react';
import { useAuth } from './AuthProvider';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  const dimension = { width: size, height: size };

  if (photo) {
    return (
      // Google/Cloudinary avatars come from arbitrary hosts, so next/image's
      // allow-list would need a new entry for every provider.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        {...dimension}
        className="shrink-0 rounded-full object-cover ring-1 ring-[#800020]/15"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      style={dimension}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#800020] to-[#4d0013] font-bold text-white ring-1 ring-[#800020]/20"
    >
      <span style={{ fontSize: Math.max(10, size * 0.4) }}>{initials(name)}</span>
    </span>
  );
}

function SignedOutDesktop() {
  return (
    <>
      <Link
        href="/login"
        className="hidden whitespace-nowrap rounded-full border border-[#800020]/25 px-5 py-2.5 text-sm font-semibold text-[#800020] transition-all duration-200 hover:border-[#800020]/60 hover:bg-[#800020]/[0.04] xl:inline-flex"
      >
        Login
      </Link>
      <Link
        href="/register"
        aria-label="Registration / Customer Access"
        title="Registration / Customer Access"
        className="hidden whitespace-nowrap rounded-full bg-[#800020] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#800020]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#68001a] hover:shadow-lg hover:shadow-[#800020]/30 xl:inline-flex"
      >
        Registration
      </Link>
    </>
  );
}

function SignedInDesktop() {
  const { displayName, photoUrl, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
      setOpen(false);
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const links = [
    { href: '/customer', label: 'My dashboard', icon: LayoutDashboard },
    { href: '/customer/biodata', label: 'My biodata', icon: UserRound },
    { href: '/customer/settings', label: 'Account settings', icon: Settings },
  ];

  return (
    <div ref={wrapperRef} className="relative hidden xl:block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[220px] items-center gap-2.5 rounded-full border border-rose-100 bg-white py-1.5 pl-1.5 pr-3 text-left transition-all duration-200 hover:border-[#800020]/30 hover:shadow-sm"
      >
        <Avatar name={displayName} photo={photoUrl} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-[#2c0d16]">
            {displayName}
          </span>
          <span className="block truncate text-[11px] leading-tight text-[#8a6a75]">
            {user?.email ?? 'Signed in'}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[#8a6a75] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-2xl border border-rose-100 bg-white p-1.5 shadow-xl shadow-[#2c0d16]/10"
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={displayName} photo={photoUrl} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[#2c0d16]">{displayName}</span>
              <span className="block truncate text-xs text-[#8a6a75]">{user?.email}</span>
            </span>
          </div>
          <div className="my-1 h-px bg-rose-100" />
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              role="menuitem"
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020]"
            >
              <Icon size={15} className="text-[#b08a95]" />
              {label}
            </Link>
          ))}
          <div className="my-1 h-px bg-rose-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            disabled={busy}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#9b1f2f] transition-colors duration-150 hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut size={15} />
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

function SignedOutMobile({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <Link
        href="/register"
        aria-label="Registration / Customer Access"
        onClick={onNavigate}
        className="inline-flex w-full items-center justify-center rounded-full bg-[#800020] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#800020]/25 transition-colors hover:bg-[#68001a]"
      >
        Registration / Customer Access
      </Link>
      <Link
        href="/login"
        onClick={onNavigate}
        className="inline-flex w-full items-center justify-center rounded-full border border-[#800020]/25 px-4 py-2.5 text-sm font-semibold text-[#800020] transition-colors hover:border-[#800020]/60 hover:bg-[#800020]/[0.04]"
      >
        Login
      </Link>
    </>
  );
}

function SignedInMobile({ onNavigate }: { onNavigate: () => void }) {
  const { displayName, photoUrl, user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
      onNavigate();
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3">
        <Avatar name={displayName} photo={photoUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-[#2c0d16]">{displayName}</span>
          <span className="block truncate text-xs text-[#8a6a75]">{user?.email}</span>
        </span>
      </div>
      <Link
        href="/customer"
        onClick={onNavigate}
        className="inline-flex w-full items-center justify-center rounded-full bg-[#800020] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#800020]/25 transition-colors hover:bg-[#68001a]"
      >
        My dashboard
      </Link>
      <Link
        href="/customer/settings"
        onClick={onNavigate}
        className="inline-flex w-full items-center justify-center rounded-full border border-[#800020]/25 px-4 py-2.5 text-sm font-semibold text-[#800020] transition-colors hover:bg-[#800020]/[0.04]"
      >
        Account settings
      </Link>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-sm font-semibold text-[#9b1f2f] transition-colors hover:bg-red-50 disabled:opacity-60"
      >
        <LogOut size={15} />
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  );
}

/** Placeholder with the same footprint as the avatar, so the header never jumps. */
function LoadingDesktop() {
  return <div className="hidden h-9 w-32 animate-pulse rounded-full bg-rose-100/70 xl:block" />;
}

export default function AuthButtons({
  variant = 'desktop',
  onNavigate,
}: {
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}) {
  const { user, loading } = useAuth();
  const close = onNavigate ?? (() => {});

  if (variant === 'mobile') {
    if (loading) return <div className="h-10 w-full animate-pulse rounded-full bg-rose-100/70" />;
    return user ? <SignedInMobile onNavigate={close} /> : <SignedOutMobile onNavigate={close} />;
  }

  if (loading) return <LoadingDesktop />;
  return user ? <SignedInDesktop /> : <SignedOutDesktop />;
}
