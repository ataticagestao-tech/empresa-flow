import { describe, expect, it } from "vitest";
import {
  buildPermissionsFromExisting,
  syncCreatePermissionsState,
  type CompanyPermissionState,
} from "./companyPermissionsState";

const companies = [
  { id: "c1", razao_social: "Acme LTDA", nome_fantasia: "Acme" },
  { id: "c2", razao_social: "Beta LTDA", nome_fantasia: null },
];

describe("companyPermissionsState", () => {
  it("buildPermissionsFromExisting marks enabled companies from existing permissions", () => {
    const result = buildPermissionsFromExisting(companies, [
      {
        company_id: "c2",
        can_view: true,
        can_edit: true,
        can_create: false,
        can_delete: false,
      },
    ]);

    expect(result).toEqual<CompanyPermissionState[]>([
      {
        company_id: "c1",
        company_name: "Acme",
        enabled: false,
        can_view: true,
        can_edit: false,
        can_create: true,
        can_delete: false,
      },
      {
        company_id: "c2",
        company_name: "Beta LTDA",
        enabled: true,
        can_view: true,
        can_edit: true,
        can_create: true,
        can_delete: false,
      },
    ]);
  });

  it("syncCreatePermissionsState preserves toggles and appends new companies", () => {
    const current: CompanyPermissionState[] = [
      {
        company_id: "c1",
        company_name: "Acme",
        enabled: true,
        can_view: true,
        can_edit: true,
        can_create: true,
        can_delete: false,
      },
    ];

    const result = syncCreatePermissionsState(companies, current);

    expect(result).toEqual<CompanyPermissionState[]>([
      {
        company_id: "c1",
        company_name: "Acme",
        enabled: true,
        can_view: true,
        can_edit: true,
        can_create: true,
        can_delete: false,
      },
      {
        company_id: "c2",
        company_name: "Beta LTDA",
        enabled: false,
        can_view: true,
        can_edit: false,
        can_create: true,
        can_delete: false,
      },
    ]);
  });
});
