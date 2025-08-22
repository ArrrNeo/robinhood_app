import json
import os
from functools import wraps

def cache_robinhood_response(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Generate a cache key from the function name and arguments
        # This is a simple approach; more complex logic might be needed for different argument types
        arg_str = "_".join(map(str, args))
        kwarg_str = "_".join(f"{k}_{v}" for k, v in kwargs.items())
        cache_key = f"{func.__name__}_{arg_str}_{kwarg_str}".replace('/', '_').replace('=', '_')

        # Sanitize the cache key to be a valid filename
        sanitized_key = "".join(c for c in cache_key if c.isalnum() or c in ('_', '-')).strip()
        
        cache_dir = os.path.join('..', 'cache', 'api_responses')
        os.makedirs(cache_dir, exist_ok=True)
        
        cache_file_path = os.path.join(cache_dir, f"{sanitized_key}.json")

        # Call the original function to get the data
        data = func(*args, **kwargs)

        # Save the data to the cache
        try:
            with open(cache_file_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error caching response for {func.__name__}: {e}")

        return data
    return wrapper
