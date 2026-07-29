namespace pr.reassignment;
using { managed } from '@sap/cds/common';

// CAP's managed aspect is the service-side equivalent of SAP's standard
// who/when fields.  In an SAP-connected deployment, the authenticated SAP
// user is written to createdBy/modifiedBy (rather than accepting it from UI).
entity PR_Master : managed {
  key ID           : UUID;
  prNumber         : String(20);
  description      : String(200);
  department       : String(100);
  currentApprover  : String(100);
  status           : String(20);  // e.g. "pending", "approved", "rejected"
}

entity Approval_Workflow : managed {
  key ID           : UUID;
  pr                : Association to PR_Master;
  approverName      : String(100);
  approvalTier      : Integer;      // e.g. 1, 2, 3 for multi-tier approval
  status            : String(20);   // "pending", "approved", "rejected"
}

entity Release_Quotes {
  key ID           : UUID;
  pr                : Association to PR_Master;
  vendorName        : String(100);
  quoteAmount       : Decimal(15,2);
  currency          : String(3);
  quoteStatus       : String(20);
}

// Every reassignment is an immutable business audit event.  Its creator and
// timestamp are supplied by the managed aspect, never by a client parameter.
entity Audit_Log : managed {
  key ID           : UUID;
  prNumber          : String(20);
  oldApprover       : String(100);
  newApprover       : String(100);
}
