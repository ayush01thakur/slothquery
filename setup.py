from setuptools import setup, find_packages
import os

setup(
    name="slothquery",
    version="1.0.2",
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
    install_requires=[
        "fastapi",
        "uvicorn",
        "pydantic",
        "sqlalchemy",
        "cryptography",
        "chromadb",
        "litellm",
        "sentence-transformers",
        "sqlglot",
        "python-multipart",
    ],
    entry_points={
        "console_scripts": [
            "slothquery=app.cli:main",
        ]
    },
    python_requires=">=3.8",
)
