use lonestar_core::application::{
    agent_tool_schema, build_agent_system_prompt, execute_agent_operations,
    extract_operations_from_text, parse_operations_value, summarize_model_context, AgentOperation,
    ModelService, PiStarInteropPort,
};
use lonestar_core::domain::{
    ActorKind, ContributionValue, Dependency, DiagramModel, ElementKind, LinkKind, MetamodelError,
    ValidationSeverity,
};
use lonestar_core::infrastructure::{builtin_template, PiStarJsonAdapter};
use std::collections::BTreeMap;

#[test]
fn canonical_templates_validate_without_errors() {
    for tpl in ["travel", "telemedicine"] {
        let model = builtin_template(tpl);
        let issues = ModelService::validate(&model);
        let errors: Vec<_> = issues
            .iter()
            .filter(|i| i.severity == ValidationSeverity::Error)
            .collect();
        assert!(
            errors.is_empty(),
            "Template '{tpl}' had validation errors: {errors:?}"
        );
    }
}

#[test]
fn actor_isa_and_participates_in_constraints() {
    let mut model = DiagramModel::new("m1", "Actor Links");
    ModelService::add_actor(&mut model, "r1", "Student", ActorKind::Role, 0.0, 0.0);
    ModelService::add_actor(&mut model, "r2", "PhD", ActorKind::Role, 200.0, 0.0);
    ModelService::add_actor(&mut model, "ag1", "Alice", ActorKind::Agent, 400.0, 0.0);
    ModelService::add_actor(&mut model, "ac1", "Org", ActorKind::Actor, 600.0, 0.0);

    // Role -> Role IsA is valid
    assert!(ModelService::add_link(&mut model, "l1", "r2", "r1", LinkKind::IsA).is_ok());

    // Duplicate/inverse link between same pair fails
    let err = ModelService::validate_connection(&model, "r1", "r2", LinkKind::ParticipatesIn)
        .unwrap_err();
    assert!(err.to_string().contains("at most one structural link"));

    // Agent -> Role IsA is invalid
    let err = ModelService::validate_connection(&model, "ag1", "r1", LinkKind::IsA).unwrap_err();
    assert!(err.to_string().contains("Is-a"));

    // Role -> Actor IsA is invalid (mixed types)
    let err = ModelService::validate_connection(&model, "r1", "ac1", LinkKind::IsA).unwrap_err();
    assert!(err.to_string().contains("Is-a"));

    // Agent -> Role ParticipatesIn is valid
    assert!(
        ModelService::add_link(&mut model, "l2", "ag1", "r2", LinkKind::ParticipatesIn).is_ok()
    );

    // Cycle check: r1 -> ag1 would create r1 -> ag1 -> r2 -> r1
    let err = ModelService::validate_connection(&model, "r1", "ag1", LinkKind::ParticipatesIn)
        .unwrap_err();
    assert!(err.to_string().contains("cycle"));
}

#[test]
fn intentional_element_links_enforce_istar2_rules() {
    let mut model = DiagramModel::new("m2", "SR Links");
    ModelService::add_actor(&mut model, "a1", "User", ActorKind::Role, 0.0, 0.0);
    ModelService::add_actor(&mut model, "a2", "System", ActorKind::Agent, 400.0, 0.0);

    ModelService::add_element(
        &mut model,
        "g1",
        "Achieve Goal",
        ElementKind::Goal,
        Some("a1".into()),
        20.0,
        50.0,
    );
    ModelService::add_element(
        &mut model,
        "t1",
        "Run Task",
        ElementKind::Task,
        Some("a1".into()),
        20.0,
        150.0,
    );
    ModelService::add_element(
        &mut model,
        "res1",
        "API Key",
        ElementKind::Resource,
        Some("a1".into()),
        180.0,
        150.0,
    );
    ModelService::add_element(
        &mut model,
        "q1",
        "High Speed",
        ElementKind::Quality,
        Some("a1".into()),
        180.0,
        50.0,
    );
    ModelService::add_element(
        &mut model,
        "t2",
        "Remote Task",
        ElementKind::Task,
        Some("a2".into()),
        420.0,
        80.0,
    );

    // Refinement t1 -> g1 valid
    assert!(ModelService::add_link(&mut model, "lk1", "t1", "g1", LinkKind::AndRefinement).is_ok());

    // Refinement cycle g1 -> t1 invalid
    let err =
        ModelService::validate_connection(&model, "g1", "t1", LinkKind::OrRefinement).unwrap_err();
    assert!(err.to_string().contains("cycle"));

    // Refinement res1 -> g1 invalid
    let err = ModelService::validate_connection(&model, "res1", "g1", LinkKind::AndRefinement)
        .unwrap_err();
    assert!(err.to_string().contains("Goals or Tasks"));

    // NeededBy: res1 -> t1 valid, t1 -> res1 invalid
    assert!(ModelService::add_link(&mut model, "lk2", "res1", "t1", LinkKind::NeededBy).is_ok());
    assert!(ModelService::validate_connection(&model, "t1", "res1", LinkKind::NeededBy).is_err());

    // Contribution: t1 -> q1 valid, t1 -> g1 invalid
    assert!(ModelService::add_link(
        &mut model,
        "lk3",
        "t1",
        "q1",
        LinkKind::Contribution {
            value: ContributionValue::Make
        }
    )
    .is_ok());
    assert!(ModelService::validate_connection(
        &model,
        "t1",
        "g1",
        LinkKind::Contribution {
            value: ContributionValue::Help
        }
    )
    .is_err());

    // Qualification: q1 -> g1 valid, g1 -> q1 invalid
    assert!(ModelService::add_link(&mut model, "lk4", "q1", "g1", LinkKind::Qualification).is_ok());
    assert!(
        ModelService::validate_connection(&model, "g1", "q1", LinkKind::Qualification).is_err()
    );

    // Cross-boundary link rejected
    let err =
        ModelService::validate_connection(&model, "t2", "g1", LinkKind::AndRefinement).unwrap_err();
    assert!(err.to_string().contains("same Actor"));
}

#[test]
fn dependency_validation_checks_actor_ownership() {
    let mut model = DiagramModel::new("m3", "Deps");
    ModelService::add_actor(&mut model, "a1", "A1", ActorKind::Actor, 0.0, 0.0);
    ModelService::add_actor(&mut model, "a2", "A2", ActorKind::Actor, 350.0, 0.0);
    ModelService::add_element(
        &mut model,
        "e1",
        "Need Data",
        ElementKind::Goal,
        Some("a1".into()),
        40.0,
        80.0,
    );

    let bad_same_actor = Dependency {
        id: "d1".into(),
        depender_actor_id: "a1".into(),
        depender_element_id: Some("e1".into()),
        dependee_actor_id: "a1".into(),
        dependee_element_id: None,
        dependum_name: "Self".into(),
        dependum_kind: ElementKind::Goal,
        x: 150.0,
        y: 50.0,
        custom_properties: BTreeMap::new(),
    };
    assert!(ModelService::add_dependency(&mut model, bad_same_actor).is_err());

    let bad_wrong_dependee_el = Dependency {
        id: "d2".into(),
        depender_actor_id: "a1".into(),
        depender_element_id: None,
        dependee_actor_id: "a2".into(),
        dependee_element_id: Some("e1".into()), // e1 belongs to a1, not a2!
        dependum_name: "Data".into(),
        dependum_kind: ElementKind::Resource,
        x: 200.0,
        y: 50.0,
        custom_properties: BTreeMap::new(),
    };
    let err = ModelService::add_dependency(&mut model, bad_wrong_dependee_el).unwrap_err();
    assert!(matches!(
        err,
        lonestar_core::domain::DomainError::Metamodel(MetamodelError::DependeeElementMismatch)
    ));
}

#[test]
fn pistar_json_roundtrip_preserves_model_semantics() {
    let original = builtin_template("travel");
    let adapter = PiStarJsonAdapter;

    let pistar_json = adapter
        .export_pistar_json(&original)
        .expect("export to piStar json should succeed");
    assert!(pistar_json.contains("istar.Role"));
    assert!(pistar_json.contains("istar.AndRefinementLink"));
    assert!(pistar_json.contains("istar.NeededByLink"));

    let reimported = PiStarJsonAdapter::import_any_json(&pistar_json)
        .expect("import from piStar json should succeed");

    assert_eq!(reimported.actors.len(), original.actors.len());
    assert_eq!(reimported.elements.len(), original.elements.len());
    assert_eq!(reimported.links.len(), original.links.len());
    assert_eq!(reimported.dependencies.len(), original.dependencies.len());

    let issues = ModelService::validate(&reimported);
    let errors: Vec<_> = issues
        .iter()
        .filter(|i| i.severity == ValidationSeverity::Error)
        .collect();
    assert!(errors.is_empty());
}

#[test]
fn native_lonestar_json_roundtrip_and_auto_layout() {
    let mut model = builtin_template("telemedicine");
    let native_json = serde_json::to_string_pretty(&model).unwrap();
    let loaded = PiStarJsonAdapter::import_any_json(&native_json).unwrap();
    assert_eq!(loaded.actors.len(), model.actors.len());

    ModelService::auto_layout(&mut model);
    for el in &model.elements {
        if let Some(aid) = &el.actor_id {
            let actor = model.find_actor(aid).unwrap();
            assert!(el.x >= actor.x && el.x + el.width <= actor.x + actor.width);
            assert!(el.y >= actor.y && el.y + el.height <= actor.y + actor.height);
        }
    }
}

#[test]
fn pistar_txt_json_and_textual_istar_import() {
    // 1. piStar .txt file (JSON with UTF-8 BOM, `diagram` metadata, and numeric customProperties)
    let pistar_txt = "\u{feff}{\n  \"actors\": [{\n    \"id\": \"a1\",\n    \"text\": \"Customer\",\n    \"type\": \"istar.Role\",\n    \"x\": 60,\n    \"y\": 80,\n    \"customProperties\": { \"Priority\": 1, \"Critical\": true },\n    \"nodes\": [{\n      \"id\": \"g1\",\n      \"text\": \"Order Coffee\",\n      \"type\": \"istar.Goal\",\n      \"x\": 90,\n      \"y\": 130,\n      \"customProperties\": { \"SLA\": 30 }\n    }]\n  }],\n  \"orphans\": [],\n  \"dependencies\": [],\n  \"links\": [],\n  \"display\": {},\n  \"diagram\": { \"name\": \"Coffee Shop piStar TXT\", \"width\": 1200, \"height\": 900 },\n  \"tool\": \"pistar.2.1.0\",\n  \"istar\": \"2.0\"\n}";

    let imported_pistar = PiStarJsonAdapter::import_any_json(pistar_txt)
        .expect("piStar .txt JSON with diagram meta & non-string customProperties should import");
    assert_eq!(imported_pistar.name, "Coffee Shop piStar TXT");
    assert_eq!(imported_pistar.actors.len(), 1);
    assert_eq!(imported_pistar.elements[0].custom_properties["SLA"], "30");

    // 2. Structured textual i* 2.0 .txt notation
    let textual = "
# Comment header
Name: Library Loan Text Model
Role: Student
Goal: Borrow Book
Task: Request Loan
Resource: Student ID
Request Loan --and--> Borrow Book
Student ID --neededBy--> Request Loan
Agent: Librarian
Task: Issue Book
Dependency: Student.Borrow Book -> Librarian.Issue Book : Book Loan (resource)
";
    let imported_txt = PiStarJsonAdapter::import_any_json(textual)
        .expect("textual i* .txt notation should import cleanly");
    assert_eq!(imported_txt.name, "Library Loan Text Model");
    assert_eq!(imported_txt.actors.len(), 2);
    assert_eq!(imported_txt.elements.len(), 4);
    assert_eq!(imported_txt.links.len(), 2);
    assert_eq!(imported_txt.dependencies.len(), 1);
    let errors: Vec<_> = ModelService::validate(&imported_txt)
        .into_iter()
        .filter(|i| i.severity == ValidationSeverity::Error)
        .collect();
    assert!(
        errors.is_empty(),
        "Unexpected validation errors: {errors:?}"
    );
}

#[test]
fn agent_batch_operations_build_valid_model_by_names() {
    let mut model = DiagramModel::new("m-agent", "Initial");
    let ops = vec![
        AgentOperation::ClearModel {
            name: Some("Smart Campus".to_string()),
        },
        AgentOperation::AddActor {
            name: "Student".to_string(),
            kind: ActorKind::Role,
        },
        AgentOperation::AddActor {
            name: "Campus App".to_string(),
            kind: ActorKind::Agent,
        },
        AgentOperation::AddElement {
            actor: "Student".to_string(),
            name: "Access Schedule".to_string(),
            kind: ElementKind::Goal,
        },
        AgentOperation::AddElement {
            actor: "Student".to_string(),
            name: "Check Timetable".to_string(),
            kind: ElementKind::Task,
        },
        AgentOperation::AddElement {
            actor: "Student".to_string(),
            name: "Student Card".to_string(),
            kind: ElementKind::Resource,
        },
        AgentOperation::AddElement {
            actor: "Student".to_string(),
            name: "Fast Lookup".to_string(),
            kind: ElementKind::Quality,
        },
        AgentOperation::AddElement {
            actor: "Campus App".to_string(),
            name: "Serve Timetable API".to_string(),
            kind: ElementKind::Task,
        },
        AgentOperation::AddLink {
            source: "Check Timetable".to_string(),
            target: "Access Schedule".to_string(),
            actor: Some("Student".to_string()),
            kind: "andRefinement".to_string(),
            value: None,
        },
        AgentOperation::AddLink {
            source: "Student Card".to_string(),
            target: "Check Timetable".to_string(),
            actor: Some("Student".to_string()),
            kind: "neededBy".to_string(),
            value: None,
        },
        AgentOperation::AddLink {
            source: "Check Timetable".to_string(),
            target: "Fast Lookup".to_string(),
            actor: Some("Student".to_string()),
            kind: "contribution".to_string(),
            value: Some(ContributionValue::Help),
        },
        AgentOperation::AddDependency {
            depender_actor: "Student".to_string(),
            depender_element: Some("Check Timetable".to_string()),
            dependee_actor: "Campus App".to_string(),
            dependee_element: Some("Serve Timetable API".to_string()),
            dependum_name: "Timetable Data".to_string(),
            dependum_kind: ElementKind::Resource,
        },
    ];

    let report = execute_agent_operations(&mut model, &ops);
    assert!(report.mutated);
    assert!(
        report.errors.is_empty(),
        "Unexpected errors: {:?}",
        report.errors
    );
    assert_eq!(model.name, "Smart Campus");
    assert_eq!(model.actors.len(), 2);
    assert_eq!(model.elements.len(), 5);
    assert_eq!(model.links.len(), 3);
    assert_eq!(model.dependencies.len(), 1);

    let errors: Vec<_> = report
        .validation_issues
        .iter()
        .filter(|i| i.severity == ValidationSeverity::Error)
        .collect();
    assert!(errors.is_empty(), "Validation errors: {errors:?}");

    // Auto-layout must keep internal elements inside their owner actor boundary
    for el in &model.elements {
        let aid = el.actor_id.as_ref().unwrap();
        let actor = model.find_actor(aid).unwrap();
        assert!(el.x >= actor.x && el.x + el.width <= actor.x + actor.width);
        assert!(el.y >= actor.y && el.y + el.height <= actor.y + actor.height);
    }

    let summary = summarize_model_context(&model, Some(&model.actors[0].id));
    assert!(summary.contains("Smart Campus"));
    assert!(summary.contains("Selected Entity: Actor \"Student\""));
    assert!(build_agent_system_prompt(true).contains("METAMODEL RULES"));
    assert_eq!(
        agent_tool_schema()["function"]["name"],
        "apply_istar_operations"
    );
}

#[test]
fn agent_auto_repairs_reversed_links_and_cross_actor_links() {
    let mut model = DiagramModel::new("m-repair", "Repair Test");
    let ops = vec![
        AgentOperation::AddActor {
            name: "Bob".to_string(),
            kind: ActorKind::Agent,
        },
        AgentOperation::AddActor {
            name: "Developer".to_string(),
            kind: ActorKind::Role,
        },
        // 1. Agent -> Role given as IsA should auto-repair to ParticipatesIn
        AgentOperation::AddLink {
            source: "Bob".to_string(),
            target: "Developer".to_string(),
            actor: None,
            kind: "isA".to_string(),
            value: None,
        },
        AgentOperation::AddElement {
            actor: "Developer".to_string(),
            name: "Ship Feature".to_string(),
            kind: ElementKind::Goal,
        },
        AgentOperation::AddElement {
            actor: "Developer".to_string(),
            name: "Write Code".to_string(),
            kind: ElementKind::Task,
        },
        AgentOperation::AddElement {
            actor: "Developer".to_string(),
            name: "Spec Doc".to_string(),
            kind: ElementKind::Resource,
        },
        AgentOperation::AddElement {
            actor: "Developer".to_string(),
            name: "High Reliability".to_string(),
            kind: ElementKind::Quality,
        },
        AgentOperation::AddElement {
            actor: "Bob".to_string(),
            name: "Run CI".to_string(),
            kind: ElementKind::Task,
        },
        // 2. Reversed NeededBy: Task -> Resource should auto-flip to Resource -> Task
        AgentOperation::AddLink {
            source: "Write Code".to_string(),
            target: "Spec Doc".to_string(),
            actor: Some("Developer".to_string()),
            kind: "neededBy".to_string(),
            value: None,
        },
        // 3. Reversed Qualification: Goal -> Quality should auto-flip to Quality -> Goal
        AgentOperation::AddLink {
            source: "Ship Feature".to_string(),
            target: "High Reliability".to_string(),
            actor: Some("Developer".to_string()),
            kind: "qualification".to_string(),
            value: None,
        },
        // 4. Reversed Contribution: Quality -> Task should auto-flip to Task -> Quality
        AgentOperation::AddLink {
            source: "High Reliability".to_string(),
            target: "Write Code".to_string(),
            actor: Some("Developer".to_string()),
            kind: "contribution".to_string(),
            value: Some(ContributionValue::Make),
        },
        // 5. Cross-boundary SR link between Developer and Bob -> auto-repair to Social Dependency
        AgentOperation::AddLink {
            source: "Write Code".to_string(),
            target: "Run CI".to_string(),
            actor: None,
            kind: "andRefinement".to_string(),
            value: None,
        },
    ];

    let report = execute_agent_operations(&mut model, &ops);
    assert!(
        report.errors.is_empty(),
        "Unexpected errors: {:?}",
        report.errors
    );
    assert_eq!(report.repaired_warnings.len(), 5);
    assert_eq!(model.links.len(), 4);
    assert_eq!(model.dependencies.len(), 1);
    assert_eq!(model.dependencies[0].dependum_name, "Run CI");
    assert_eq!(model.dependencies[0].dependum_kind, ElementKind::Task);

    assert!(model
        .links
        .iter()
        .any(|l| l.link_kind == LinkKind::ParticipatesIn));
    assert!(model
        .links
        .iter()
        .any(|l| l.link_kind == LinkKind::NeededBy));
    assert!(model
        .links
        .iter()
        .any(|l| l.link_kind == LinkKind::Qualification));
    assert!(model.links.iter().any(|l| matches!(
        l.link_kind,
        LinkKind::Contribution {
            value: ContributionValue::Make
        }
    )));

    let validation_errors: Vec<_> = report
        .validation_issues
        .iter()
        .filter(|i| i.severity == ValidationSeverity::Error)
        .collect();
    assert!(validation_errors.is_empty());
}

#[test]
fn agent_extracts_operations_from_fenced_blocks() {
    let istar_ops_reply = "I added the Patient role and primary goal.\n\n```istar-ops\n[\n  {\"op\": \"addActor\", \"name\": \"Patient\", \"kind\": \"role\"},\n  {\"op\": \"addElement\", \"actor\": \"Patient\", \"name\": \"Stay Healthy\", \"kind\": \"goal\"}\n]\n```\n\nLet me know if you want tasks added.";
    let (ops1, cleaned1) =
        extract_operations_from_text(istar_ops_reply).expect("should parse istar-ops fence");
    assert_eq!(ops1.len(), 2);
    assert!(!cleaned1.contains("addActor"));
    assert!(cleaned1.contains("I added the Patient role"));
    assert!(cleaned1.contains("Let me know if you want tasks added."));

    let json_batch_reply = "Here are the updates:\n```json\n{\"operations\": [{\"op\": \"addActor\", \"name\": \"Doctor\", \"kind\": \"role\"}]}\n```";
    let (ops2, cleaned2) =
        extract_operations_from_text(json_batch_reply).expect("should parse json batch fence");
    assert_eq!(ops2.len(), 1);
    assert_eq!(cleaned2, "Here are the updates:");
}

#[test]
fn agent_recovers_small_llm_omitted_fields_and_top_down_links() {
    let raw_payload = serde_json::json!({
        "operations": [
            { "op": "addActor", "name": "Studente" },
            { "op": "addElement", "kind": "Goal", "name": "Prendere in prestito un libro" },
            { "op": "addElement", "kind": "Task", "name": "Richiedere prestito" },
            { "op": "addElement", "kind": "Resource", "name": "Tessera Universitaria" },
            { "op": "addActor", "name": "Biblioteca" },
            { "op": "addDependency", "dependerActor": "Studente", "dependeeActor": "Biblioteca" },
            { "op": "addLink", "source": "Studente", "target": "Richiedere prestito" },
            { "op": "addLink", "source": "Prendere in prestito un libro", "target": "Richiedere prestito" },
            { "op": "addLink", "source": "Richiedere prestito", "target": "Tessera Universitaria" }
        ]
    });

    let (ops, parse_errs) = parse_operations_value(&raw_payload);
    assert!(
        parse_errs.is_empty(),
        "Unexpected parse errs: {parse_errs:?}"
    );
    assert_eq!(ops.len(), 9);

    let mut model = DiagramModel::new("m-gemma", "Library Model");
    let report = execute_agent_operations(&mut model, &ops);
    assert!(
        report.errors.is_empty(),
        "Unexpected errors: {:?}",
        report.errors
    );
    assert!(!report.repaired_warnings.is_empty());
    assert_eq!(model.actors.len(), 2);
    assert_eq!(model.elements.len(), 3);
    assert_eq!(model.dependencies.len(), 1);
    assert!(!model.dependencies[0].dependum_name.is_empty());

    // Both Task->Goal and Resource->Task links must be created with canonical iStar 2.0 orientation
    let task_id = model
        .elements
        .iter()
        .find(|e| e.name == "Richiedere prestito")
        .unwrap()
        .id
        .clone();
    let goal_id = model
        .elements
        .iter()
        .find(|e| e.name == "Prendere in prestito un libro")
        .unwrap()
        .id
        .clone();
    let res_id = model
        .elements
        .iter()
        .find(|e| e.name == "Tessera Universitaria")
        .unwrap()
        .id
        .clone();

    assert!(model.links.iter().any(|l| {
        l.source_id == task_id && l.target_id == goal_id && l.link_kind == LinkKind::AndRefinement
    }));
    assert!(model.links.iter().any(|l| {
        l.source_id == res_id && l.target_id == task_id && l.link_kind == LinkKind::NeededBy
    }));

    let val_errors: Vec<_> = report
        .validation_issues
        .iter()
        .filter(|i| i.severity == ValidationSeverity::Error)
        .collect();
    assert!(val_errors.is_empty(), "Validation errors: {val_errors:?}");
}
