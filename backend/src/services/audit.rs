use sqlx::{Executor, Postgres};
use uuid::Uuid;

pub async fn record_audit<'e, E>(
    executor: E,
    actor: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = Postgres>,
{
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO audit_logs (id, actor, action, details)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(id)
    .bind(actor)
    .bind(action)
    .bind(details)
    .execute(executor)
    .await?;
    Ok(())
}
