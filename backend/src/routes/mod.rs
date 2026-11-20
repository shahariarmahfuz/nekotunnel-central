pub mod admin_api;
pub mod client_api;

use axum::Router;

use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .merge(client_api::router())
        .merge(admin_api::router())
        .with_state(state)
}
