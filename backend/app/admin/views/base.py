"""Base admin view with common settings."""

from sqladmin import ModelView


class BaseAdminView(ModelView):
    """Base admin view with common settings."""
    
    def is_accessible(self, request):
        """Check if admin interface is accessible."""
        return True  # Simplified for development
