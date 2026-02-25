import { describe, expect, it } from "vitest";
import { normalizeCompanyPermissions } from "./userPermissionsUtils";

describe("normalizeCompanyPermissions", () => {
  it("returns all false when permission row is missing", () => {
    const permissions = normalizeCompanyPermissions(null);

    expect(permissions).toEqual({
      can_view: false,
      can_edit: false,
      can_create: false,
      can_delete: false,
    });
  });

  it("preserves explicit database flags", () => {
    const permissions = normalizeCompanyPermissions({
      can_view: true,
      can_edit: false,
      can_create: false,
      can_delete: false,
    });

    expect(permissions).toEqual({
      can_view: true,
      can_edit: false,
      can_create: false,
      can_delete: false,
    });
  });

  it("forces create when edit permission is true", () => {
    const permissions = normalizeCompanyPermissions({
      can_view: true,
      can_edit: true,
      can_create: false,
      can_delete: false,
    });

    expect(permissions).toEqual({
      can_view: true,
      can_edit: true,
      can_create: true,
      can_delete: false,
    });
  });
});
