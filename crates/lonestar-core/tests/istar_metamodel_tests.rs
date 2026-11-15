use lonestar_core::application::{ModelService, PiStarInteropPort};
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
