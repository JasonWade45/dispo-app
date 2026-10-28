"""CLI: refresh site_snapshot.json (used by the scheduled GitHub Action)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api._scrape import snapshot  # noqa: E402

if __name__ == '__main__':
    data = snapshot()
    with open('site_snapshot.json', 'w') as f:
        json.dump(data, f, indent=1)
    print(f"checked {data['checked']}: {data['count']} listings · {data['available']} available · "
          f"{data['pending']} pending · {data['sold']} sold")
