#!/usr/bin/env python3
"""
LocalChat - Quick Start Script
Checks dependencies and starts the server
"""

import subprocess
import sys
import socket
import os

BANNER = """

        LocalChat v1.0             
    Real-time Local Network Chat        

"""

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def check_and_install():
    print("📦 Checking dependencies...")
    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    req_file = os.path.join(backend_dir, "requirements.txt")
    
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-r", req_file, "-q"],
            stdout=subprocess.DEVNULL
        )
        print("All dependencies ready!\n")
    except subprocess.CalledProcessError:
        print("Failed to install dependencies.")
        print(f"Run manually: pip install -r {req_file}")
        sys.exit(1)

def start_server():
    print(BANNER)
    check_and_install()

    import qrcode

    ip = get_local_ip()
    port = 8000

    print("═" * 45)
    print(f"Your Local IP : {ip}")
    print(f"Share this URL: http://{ip}:{port}")
    print(f"Open locally  : http://localhost:{port}")
    print("═" * 45)
    
    qr = qrcode.QRCode(version=1, box_size=1, border=1)
    qr.add_data(f"http://{ip}:{port}")
    qr.make()
    qr.print_ascii(invert=True)
    
    print("  On OTHER devices: open browser → type the URL above")
    print("  Press Ctrl+C to stop the server")
    print("═" * 45 + "\n")

    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    os.chdir(backend_dir)

    try:
        subprocess.run([
            sys.executable, "-m", "uvicorn",
            "server:app",
            "--host", "0.0.0.0",
            "--port", str(port),
            "--reload"  # Remove this in production
        ])
    except KeyboardInterrupt:
        print("\n\nServer stopped. Goodbye!")

if __name__ == "__main__":
    start_server()
