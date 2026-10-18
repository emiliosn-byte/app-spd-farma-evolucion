export type Role = 'estandar' | 'administrador' | 'superpowers';
export type RecordRow = { id: string; version: number; [key: string]: any };
export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  enabled: boolean;
  employee_id: string | null;
  must_change_password: boolean;
  version: number;
};
export type Balance = {
  employee_id: string;
  approved: number;
  paid: number;
  outstanding: number;
  latest_settlement: string;
};
export type Financial = {
  accrued: number;
  liquidable: number;
  approved: number;
  paid: number;
  balances: Balance[];
  entitlements: RecordRow[];
};
export type Preview = {
  id: string;
  cutoff: string;
  lines: RecordRow[];
  blockers: { code: string; detail: string; month: string | null }[];
  signature: string;
  approved: boolean;
};
