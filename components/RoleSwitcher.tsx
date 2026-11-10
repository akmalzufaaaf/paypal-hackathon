"use client";

import type { Role } from "./demo-client";

interface RoleSwitcherProps {
  role: Role;
  clientName: string;
  freelancerName: string;
  onRoleChange: (role: Role) => void;
}

export default function RoleSwitcher({
  role,
  clientName,
  freelancerName,
  onRoleChange,
}: RoleSwitcherProps) {
  return (
    <div className="role-switcher" aria-label="Demo role switcher">
      <span className="role-switcher-label">Acting as</span>
      <div className="role-switcher-buttons" role="group" aria-label="Role">
        <button
          type="button"
          className={role === "client" ? "role-btn active" : "role-btn"}
          aria-pressed={role === "client"}
          onClick={() => onRoleChange("client")}
        >
          Client
          <small>{clientName}</small>
        </button>
        <button
          type="button"
          className={role === "freelancer" ? "role-btn active" : "role-btn"}
          aria-pressed={role === "freelancer"}
          onClick={() => onRoleChange("freelancer")}
        >
          Freelancer
          <small>{freelancerName}</small>
        </button>
      </div>
      <span className="role-switcher-note">Demo only — no login, roles just gate actions.</span>
    </div>
  );
}
