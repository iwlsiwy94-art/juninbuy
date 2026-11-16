'use client';
import { createContext, useContext } from 'react';

const Ctx = createContext(null);

export function UserProvider({ user, children }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useUser() {
  return useContext(Ctx);
}

export function canEdit(u) {
  return !!u && (u.role === 'admin' || u.role === 'editor');
}
