import { describe, expect, it } from "vitest";
import { buildPermissionRowsForUser } from "./adminPermissionsUtils";
import type { CompanyPermissionInput } from "@/types/admin";

describe("buildPermissionRowsForUser", () => {
  it("filters out entries with no granted permission", () => {
    const permissions: CompanyPermissionInput[] = [
      {
        company_id: "c1",
        can_view: false,
        can_edit: false,
        can_create: false,
        can_delete: false,
      },
      {
        company_id: "c2",
        can_view: true,
        can_edit: false,
        can_create: false,
        can_delete: false,
      },
    ];

    const rows = buildPermissionRowsForUser("u1", permissions, "admin1");
    expect(rows).toHaveLength(1);
    expect(rows[0].company_id).toBe("c2");
  });

  it("maps fields to persistence shape", () => {
    const permissions: CompanyPermissionInput[] = [
      {
        company_id: "c9",
        can_view: true,
        can_edit: true,
        can_create: true,
        can_delete: false,
      },
    ];

    const rows = buildPermissionRowsForUser("u9", permissions, "admin9");
    expect(rows).toEqual([
      {
        user_id: "u9",
        company_id: "c9",
        can_view: true,
        can_edit: true,
        can_create: true,
        can_delete: false,
        granted_by: "admin9",
      },
    ]);
  });

  it("elevates create permission when edit is granted", () => {
    const permissions: CompanyPermissionInput[] = [
      {
        company_id: "c77",
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
      },
    ];

    const rows = buildPermissionRowsForUser("u77", permissions, "admin77");
    expect(rows).toEqual([
      {
        user_id: "u77",
        company_id: "c77",
        can_view: true,
        can_edit: true,
        can_create: true,
        can_delete: false,
        granted_by: "admin77",
      },
    ]);
  });
});
