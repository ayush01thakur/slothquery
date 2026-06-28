from setuptools import setup, find_packages
import os

# Read requirements from backend/requirements.txt
requirements_path = os.path.join("backend", "requirements.txt")
requirements = []
if os.path.exists(requirements_path):
    with open(requirements_path, "r") as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="slothquery",
    version="1.0.0",
    description="Local-first organizational intelligence platform",
    author="Ayush Thakur",
    author_email="ayush01thakur@gmail.com",
    packages=find_packages(where="backend"),
    package_dir={"": "backend"},
    include_package_data=True,
    package_data={
        # Bundle all compiled React frontend files in the python package
        "app": ["dist/**/*", "dist/*", "dist/assets/*"],
    },
    install_requires=requirements,
    entry_points={
        "console_scripts": [
            "slothquery=app.cli:main",
        ]
    },
    python_requires=">=3.8",
)
