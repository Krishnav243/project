sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, MessageToast, MessageBox, JSONModel, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("jk.cement.procurement.view.Main", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                prMaster: "Total Records: 0",
                workflow: "Total Records: 0",
                quotes: "Total Records: 0",
                audit: "Total Records: 0"
            }), "counts");
            this._refreshTableFiltersAndCounts();
        },

        onCurrentApproverChange: function () {
            this._refreshTableFiltersAndCounts();
        },

        onTabSelect: function () {
            this._refreshTableFiltersAndCounts();
        },

        onReassign: function () {
            var oView = this.getView();
            var sCurrent = oView.byId("idCurrent").getSelectedKey();
            var oNewApprover = oView.byId("idNew");
            var sNew = oNewApprover.getSelectedKey();
            var sStatus = oView.byId("idStatus").getSelectedKey().toLowerCase();
            var sDepartment = oView.byId("idDepartment").getSelectedKey();

            if (!sCurrent || !sNew || !sDepartment) {
                MessageBox.error("Select a current approver, a registered replacement, and an SAP department.");
                return;
            }

            var oModel = oView.getModel();
            var oAction = oModel.bindContext("/reassignPRs(...)");
            
            oAction.setParameter("currentApprover", sCurrent);
            oAction.setParameter("newApprover", sNew);
            oAction.setParameter("status", sStatus);
            oAction.setParameter("department", sDepartment);

            oAction.execute().then(function () {
                var oResult = oAction.getBoundContext().getObject();
                MessageBox.success(oResult.value || "Reassignment executed successfully!");
                oModel.refresh();
                this._refreshTableFiltersAndCounts();
            }.bind(this)).catch(function (oError) {
                MessageBox.error("Error executing reassignment: " + oError.message);
            });
        },

        onRefresh: function () {
            this.getView().getModel().refresh();
            this._refreshTableFiltersAndCounts();
            MessageToast.show("Live database data refreshed!");
        },

        _refreshTableFiltersAndCounts: async function () {
            var oView = this.getView();
            var oModel = oView.getModel();
            var sApprover = oView.byId("idCurrent").getSelectedKey().trim();
            var aPRs = await this._requestRows(oModel, "/PR_Master", sApprover ? [new Filter("currentApprover", FilterOperator.EQ, sApprover)] : []);
            var aWorkflows = await this._requestRows(oModel, "/Approval_Workflow", sApprover ? [new Filter("approverName", FilterOperator.EQ, sApprover)] : []);
            var aQuotes = await this._requestRows(oModel, "/Release_Quotes", []);
            var aAudits = await this._requestRows(oModel, "/Audit_Log", []);
            var aPRIds = new Set(aPRs.map(function (oPR) { return oPR.ID; }));
            var aPRNumbers = new Set(aPRs.map(function (oPR) { return oPR.prNumber; }));

            if (sApprover) {
                aQuotes = aQuotes.filter(function (oQuote) { return aPRIds.has(oQuote.pr_ID); });
                aAudits = aAudits.filter(function (oAudit) { return aPRNumbers.has(oAudit.prNumber); });
            }

            this._setBindingFilter("idPRMasterTable", sApprover ? [new Filter("currentApprover", FilterOperator.EQ, sApprover)] : []);
            this._setBindingFilter("idWorkflowTable", sApprover ? [new Filter("approverName", FilterOperator.EQ, sApprover)] : []);
            this._setBindingFilter("idQuotesTable", this._orFilters("pr_ID", Array.from(aPRIds), sApprover));
            this._setBindingFilter("idAuditTable", this._orFilters("prNumber", Array.from(aPRNumbers), sApprover));

            var oCounts = oView.getModel("counts");
            oCounts.setProperty("/prMaster", "Total Records: " + aPRs.length);
            oCounts.setProperty("/workflow", "Total Records: " + aWorkflows.length);
            oCounts.setProperty("/quotes", "Total Records: " + aQuotes.length);
            oCounts.setProperty("/audit", "Total Records: " + aAudits.length);
        },

        _requestRows: async function (oModel, sPath, aFilters) {
            var oList = oModel.bindList(sPath, null, null, aFilters);
            var aContexts = await oList.requestContexts(0, 10000);
            return aContexts.map(function (oContext) { return oContext.getObject(); });
        },

        _orFilters: function (sProperty, aValues, bFiltered) {
            if (!bFiltered) return [];
            if (!aValues.length) return [new Filter(sProperty, FilterOperator.EQ, "__no_matching_record__")];
            return [new Filter({ filters: aValues.map(function (sValue) {
                return new Filter(sProperty, FilterOperator.EQ, sValue);
            }), and: false })];
        },

        _setBindingFilter: function (sTableId, aFilters) {
            var oBinding = this.getView().byId(sTableId).getBinding("items");
            if (oBinding) oBinding.filter(aFilters);
        }

    });
});
