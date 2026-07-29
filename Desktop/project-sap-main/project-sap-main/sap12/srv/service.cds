using pr.reassignment as db from '../db/schema';

// CAP publishes this service at /pr. Keeping the path explicit
// makes it match the UI5 model and the hand-built test page.
@path: '/pr'
service PRService {

  entity PR_Master as projection on db.PR_Master;
  entity Approval_Workflow as projection on db.Approval_Workflow;
  entity Release_Quotes as projection on db.Release_Quotes;
  entity Audit_Log as projection on db.Audit_Log;

  // Value-help entities are filled from the live PR/workflow records by the
  // service implementation. They intentionally do not maintain a hardcoded
  // list of people or departments.
  @readonly entity Approvers {
    key name : String(100);
  }

  @readonly entity Departments {
    key name : String(100);
  }

  // Custom action: reassign all pending PRs from one approver to another
  action reassignPRs (
    currentApprover : String,
    newApprover      : String,
    status            : String,
    department        : String
  ) returns String;

}
