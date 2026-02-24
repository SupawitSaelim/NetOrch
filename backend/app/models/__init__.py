"""Models package — placeholder for future database ORM models.

NetOrch currently uses JSON-file-based persistence for users and audit logs.
If/when migrating to a database (e.g., SQLAlchemy + PostgreSQL), ORM models
will be defined here.

Planned models:
    - User (username, password_hash, role, display_name)
    - AuditEntry (timestamp, user, action, resource, detail)
    - TopologySnapshot (nodes, links, timestamp)
    - SavedLab (name, config, user, created_at)
"""