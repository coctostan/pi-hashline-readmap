"""Small Python fixture for integration testing."""


class UserManager:
    """Stores a bounded set of users keyed by id."""
    def __init__(self, max_users: int = 100):
        self.max_users = max_users
        self._users: dict[int, dict] = {}
        self._next_id = 1

    def add_user(self, name: str, email: str) -> dict:
        """Insert a single user and return the created payload."""
        if len(self._users) >= self.max_users:
            raise ValueError("Maximum users reached")
        user = {
            "id": self._next_id,
            "name": name,
            "email": email,
        }
        self._users[self._next_id] = user
        self._next_id += 1
        return user


def create_default_manager() -> UserManager:
    manager = UserManager(max_users=500)
    manager.add_user("Grace Hopper", "grace@example.com")
    return manager