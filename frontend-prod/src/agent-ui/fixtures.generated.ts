/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/gen-contract.mjs from src/agent-ui/ui-contract.json,
 * which is a verbatim snapshot of the backend's agui.ui_contract contract.
 *
 * Regenerate with: npm run contract:gen
 */

import type { PropsByName } from "./contract.generated";

/**
 * The backend's own example payload per component. These are what the cards are
 * built and reviewed against — no running agent required.
 */
export const FIXTURES: { [K in keyof PropsByName]: PropsByName[K] } = {
  "crModeChoice": {
    "title": "Create Change Request",
    "subtitle": "How would you like to proceed?",
    "modes": [
      {
        "value": "single",
        "label": "Single Change Request",
        "description": "Raise one change request against a platform and target system.",
        "enabled": true
      },
      {
        "value": "bulk",
        "label": "Bulk Change Request",
        "description": "Raise multiple change requests from a single upload.",
        "enabled": false
      }
    ],
    "meta": null
  },
  "featureComingSoon": {
    "title": "Bulk Change Request",
    "message": "Feature available soon.",
    "back_label": "Back to Single Change Request",
    "meta": null
  },
  "crIntakeForm": {
    "title": "Create Change Request",
    "subtitle": "To GET STARTED, please fill in the following information.",
    "hint": "Please fill the Reason For Change and Description for change Or Jira ID/ IRIS ID to fetch the information",
    "platforms": [
      "HMD",
      "TIME",
      "Back to basics"
    ],
    "target_systems": null,
    "values": null,
    "errors": null,
    "iris_enabled": false,
    "meta": null
  },
  "templateOrCrPicker": {
    "title": "To proceed ahead,",
    "subtitle": "Please fill in the following information.",
    "template_label": "Template ID",
    "template_optional": true,
    "template_options": [
      "Temp45678",
      "Temp45679"
    ],
    "reference_label": "Reference Change Request ID",
    "reference_options": [
      {
        "label": "CR ID 654678",
        "value": "654678",
        "badge": "Galaxy",
        "details": [
          {
            "label": "Similarity score",
            "value": "0.912",
            "tone": "neutral"
          },
          {
            "label": "Platform",
            "value": "Galaxy",
            "tone": "positive"
          },
          {
            "label": "Target System",
            "value": "PJS 0021237113",
            "tone": "neutral"
          },
          {
            "label": "Change Cycle",
            "value": "GAI_4_Tier_ECC_Landscape"
          },
          {
            "label": "Description",
            "value": "Config change to the treasury posting rules.",
            "wide": true
          }
        ]
      }
    ],
    "selected_template": null,
    "selected_reference": null,
    "meta": null
  },
  "cycleIdPicker": {
    "message": "I've analyzed your Platform, Target System, and Change details. Please select among the following deployment cycles available for this project.",
    "options": [
      {
        "label": "GAI_4_Tier_ECC_Landscape",
        "value": "0000012345"
      }
    ],
    "draft_cycle_id": null,
    "keep_current_label": null,
    "meta": null
  },
  "draftReview": {
    "title": "Please review the Change Request Draft and update the information if required.",
    "subtitle": "By clicking on proceed, your change request will be raised successfully.",
    "sections": [
      {
        "name": "Details",
        "fields": [
          {
            "key": "zzfld00000v_cus",
            "label": "Risk",
            "value": "Low",
            "empty": false,
            "editable": true,
            "lock_type": null,
            "field_type": "boolean",
            "section": "Testing Requirements",
            "allowed_values": [
              "Yes",
              "No"
            ]
          }
        ]
      }
    ],
    "confirm_text": "These inputs will raise a change request for CR ID 45678987.",
    "question_text": "Are you sure to proceed?",
    "notices": null,
    "actions": [
      {
        "label": "Reject",
        "value": "reject"
      },
      {
        "label": "Submit",
        "value": "approve"
      },
      {
        "label": "Submit for Approval",
        "value": "submit_for_approval"
      }
    ],
    "meta": null
  },
  "fieldPrompt": {
    "title": null,
    "message": "Which platform is this change for?",
    "options": [
      {
        "label": "HMD",
        "value": "HMD"
      }
    ],
    "allow_free_text": true,
    "placeholder": "Type your reply…",
    "meta": null
  },
  "submissionResult": {
    "status": "success",
    "message": "Successfully submitted.",
    "cr_id": "45678987",
    "meta": null
  }
};
