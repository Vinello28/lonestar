use crate::application::ModelService;
use crate::domain::{
    ActorKind, ContributionValue, Dependency, DiagramModel, ElementKind, LinkKind,
};
use std::collections::BTreeMap;

/// Provides canonical iStar 2.0 reference models so users can explore, modify, or start cleanly.
pub fn builtin_template(template_id: &str) -> DiagramModel {
    match template_id {
        "telemedicine" => telemedicine_template(),
        "empty" => ModelService::create_empty_model("Untitled i* 2.0 Model"),
        _ => travel_reimbursement_template(),
    }
}

/// Canonical iStar 2.0 Travel Reimbursement example illustrating every actor type, intentional element,
/// refinement (AND/OR), NeededBy, Contribution, Qualification, actor association, and social dependency.
pub fn travel_reimbursement_template() -> DiagramModel {
    let mut model = DiagramModel::new("tpl-travel", "University Travel Reimbursement (iStar 2.0)");
    model.metadata.description =
        "Canonical iStar 2.0 Strategic Rationale & Strategic Dependency model.".to_string();

    // Actors
    let mut student = ModelService::add_actor(
        &mut model,
        "a-student",
        "Student",
        ActorKind::Role,
        80.0,
        80.0,
    );
    student.width = 410.0;
    student.height = 380.0;
    model.actors[0] = student;

    let mut agency = ModelService::add_actor(
        &mut model,
        "a-agency",
        "Travel Agency",
        ActorKind::Agent,
        660.0,
        70.0,
    );
    agency.width = 350.0;
    agency.height = 300.0;
    model.actors[1] = agency;

    let mut dept = ModelService::add_actor(
        &mut model,
        "a-university",
        "University Finance",
        ActorKind::Actor,
        640.0,
        470.0,
    );
    dept.width = 370.0;
    dept.height = 290.0;
    model.actors[2] = dept;

    let mut researcher = ModelService::add_actor(
        &mut model,
        "a-phd",
        "PhD Candidate",
        ActorKind::Role,
        120.0,
        560.0,
    );
    researcher.width = 230.0;
    researcher.height = 170.0;
    model.actors[3] = researcher;

    // Student internal elements
    ModelService::add_element(
        &mut model,
        "e-reimb",
        "Travel Reimbursed",
        ElementKind::Goal,
        Some("a-student".into()),
        210.0,
        140.0,
    );
    ModelService::add_element(
        &mut model,
        "e-fast",
        "Fast Approval",
        ElementKind::Quality,
        Some("a-student".into()),
        335.0,
        245.0,
    );
    ModelService::add_element(
        &mut model,
        "e-book",
        "Book Conference Trip",
        ElementKind::Task,
        Some("a-student".into()),
        115.0,
        255.0,
    );
    ModelService::add_element(
        &mut model,
        "e-submit",
        "Submit Expense Claim",
        ElementKind::Task,
        Some("a-student".into()),
        115.0,
        365.0,
    );
    ModelService::add_element(
        &mut model,
        "e-receipts",
        "Travel Receipts",
        ElementKind::Resource,
        Some("a-student".into()),
        310.0,
        365.0,
    );

    // Agency internal elements
    ModelService::add_element(
        &mut model,
        "e-itinerary",
        "Issue Optimal Itinerary",
        ElementKind::Task,
        Some("a-agency".into()),
        760.0,
        155.0,
    );
    ModelService::add_element(
        &mut model,
        "e-lowcost",
        "Low Ticket Cost",
        ElementKind::Quality,
        Some("a-agency".into()),
        840.0,
        265.0,
    );
    ModelService::add_element(
        &mut model,
        "e-gds",
        "Airline GDS Feed",
        ElementKind::Resource,
        Some("a-agency".into()),
        685.0,
        265.0,
    );

    // University internal elements
    ModelService::add_element(
        &mut model,
        "e-audit",
        "Expenses Verified",
        ElementKind::Goal,
        Some("a-university".into()),
        760.0,
        540.0,
    );
    ModelService::add_element(
        &mut model,
        "e-payout",
        "Approve & Wire Funds",
        ElementKind::Task,
        Some("a-university".into()),
        760.0,
        650.0,
    );

    // Valid iStar 2.0 Links
    let _ = ModelService::add_link(
        &mut model,
        "l-1",
        "e-book",
        "e-reimb",
        LinkKind::AndRefinement,
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-2",
        "e-submit",
        "e-reimb",
        LinkKind::AndRefinement,
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-3",
        "e-receipts",
        "e-submit",
        LinkKind::NeededBy,
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-4",
        "e-fast",
        "e-reimb",
        LinkKind::Qualification,
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-5",
        "e-submit",
        "e-fast",
        LinkKind::Contribution {
            value: ContributionValue::Help,
        },
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-6",
        "e-gds",
        "e-itinerary",
        LinkKind::NeededBy,
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-7",
        "e-itinerary",
        "e-lowcost",
        LinkKind::Contribution {
            value: ContributionValue::Make,
        },
    );
    let _ = ModelService::add_link(
        &mut model,
        "l-8",
        "e-payout",
        "e-audit",
        LinkKind::AndRefinement,
    );
    let _ = ModelService::add_link(&mut model, "l-9", "a-phd", "a-student", LinkKind::IsA);

    // Social Dependencies
    let _ = ModelService::add_dependency(
        &mut model,
        Dependency {
            id: "d-1".into(),
            depender_actor_id: "a-student".into(),
            depender_element_id: Some("e-book".into()),
            dependee_actor_id: "a-agency".into(),
            dependee_element_id: Some("e-itinerary".into()),
            dependum_name: "Flight Ticket".into(),
            dependum_kind: ElementKind::Resource,
            x: 500.0,
            y: 185.0,
            custom_properties: BTreeMap::new(),
        },
    );

    let _ = ModelService::add_dependency(
        &mut model,
        Dependency {
            id: "d-2".into(),
            depender_actor_id: "a-student".into(),
            depender_element_id: Some("e-reimb".into()),
            dependee_actor_id: "a-university".into(),
            dependee_element_id: Some("e-audit".into()),
            dependum_name: "Reimbursement Approved".into(),
            dependum_kind: ElementKind::Goal,
            x: 500.0,
            y: 445.0,
            custom_properties: BTreeMap::new(),
        },
    );

    model
}

pub fn telemedicine_template() -> DiagramModel {
    let mut model = DiagramModel::new("tpl-telemed", "Smart Telemedicine Platform (iStar 2.0)");
    model.metadata.description =
        "Strategic Goal Model for remote patient monitoring and clinical triage.".to_string();

    let mut patient = ModelService::add_actor(
        &mut model,
        "a-patient",
        "Patient",
        ActorKind::Role,
        90.0,
        100.0,
    );
    patient.width = 360.0;
    patient.height = 310.0;
    model.actors[0] = patient;

    let mut platform = ModelService::add_actor(
        &mut model,
        "a-platform",
        "TeleMed Cloud",
        ActorKind::Agent,
        590.0,
        90.0,
    );
    platform.width = 360.0;
    platform.height = 330.0;
    model.actors[1] = platform;

    let mut doctor = ModelService::add_actor(
        &mut model,
        "a-doctor",
        "Physician",
        ActorKind::Role,
        590.0,
        480.0,
    );
    doctor.width = 360.0;
    doctor.height = 240.0;
    model.actors[2] = doctor;

    ModelService::add_element(
        &mut model,
        "e-care",
        "Receive Timely Care",
        ElementKind::Goal,
        Some("a-patient".into()),
        195.0,
        165.0,
    );
    ModelService::add_element(
        &mut model,
        "e-vitals",
        "Share Wearable Vitals",
        ElementKind::Task,
        Some("a-patient".into()),
        130.0,
        280.0,
    );
    ModelService::add_element(
        &mut model,
        "e-privacy",
        "Data Privacy",
        ElementKind::Quality,
        Some("a-patient".into()),
        295.0,
        280.0,
    );

    ModelService::add_element(
        &mut model,
        "e-triage",
        "Automated Triage",
        ElementKind::Task,
        Some("a-platform".into()),
        705.0,
        160.0,
    );
    ModelService::add_element(
        &mut model,
        "e-ehr",
        "Encrypted EHR Store",
        ElementKind::Resource,
        Some("a-platform".into()),
        625.0,
        295.0,
    );
    ModelService::add_element(
        &mut model,
        "e-uptime",
        "High Availability",
        ElementKind::Quality,
        Some("a-platform".into()),
        795.0,
        295.0,
    );

    ModelService::add_element(
        &mut model,
        "e-diagnose",
        "Diagnose & Prescribe",
        ElementKind::Task,
        Some("a-doctor".into()),
        705.0,
        565.0,
    );

    let _ = ModelService::add_link(
        &mut model,
        "tl-1",
        "e-vitals",
        "e-care",
        LinkKind::OrRefinement,
    );
    let _ = ModelService::add_link(
        &mut model,
        "tl-2",
        "e-privacy",
        "e-care",
        LinkKind::Qualification,
    );
    let _ = ModelService::add_link(&mut model, "tl-3", "e-ehr", "e-triage", LinkKind::NeededBy);
    let _ = ModelService::add_link(
        &mut model,
        "tl-4",
        "e-triage",
        "e-uptime",
        LinkKind::Contribution {
            value: ContributionValue::Help,
        },
    );

    let _ = ModelService::add_dependency(
        &mut model,
        Dependency {
            id: "td-1".into(),
            depender_actor_id: "a-patient".into(),
            depender_element_id: Some("e-care".into()),
            dependee_actor_id: "a-platform".into(),
            dependee_element_id: Some("e-triage".into()),
            dependum_name: "24/7 Health Triage".into(),
            dependum_kind: ElementKind::Goal,
            x: 455.0,
            y: 190.0,
            custom_properties: BTreeMap::new(),
        },
    );
    let _ = ModelService::add_dependency(
        &mut model,
        Dependency {
            id: "td-2".into(),
            depender_actor_id: "a-platform".into(),
            depender_element_id: Some("e-triage".into()),
            dependee_actor_id: "a-doctor".into(),
            dependee_element_id: Some("e-diagnose".into()),
            dependum_name: "Clinical Review".into(),
            dependum_kind: ElementKind::Task,
            x: 840.0,
            y: 430.0,
            custom_properties: BTreeMap::new(),
        },
    );

    model
}
