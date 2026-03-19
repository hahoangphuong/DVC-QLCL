import os
import requests
from bs4 import BeautifulSoup


# Đọc thông tin đăng nhập từ biến môi trường / Secrets
LOGIN_URL = os.environ["ASPNET_LOGIN_URL"]
USERNAME = os.environ["ASPNET_USERNAME"]
PASSWORD = os.environ["ASPNET_PASSWORD"]


def create_authenticated_session() -> requests.Session:
    """
    Đăng nhập vào website ASP.NET và trả về requests.Session đã xác thực.

    Quy trình:
    1. GET trang login để lấy __RequestVerificationToken (XSRF token)
    2. POST form đăng nhập kèm token + credentials
    3. Trả về session đang giữ cookie xác thực
    """
    session = requests.Session()

    # --- Bước 1: GET trang login để lấy XSRF token ---
    resp = session.get(LOGIN_URL, timeout=15)
    resp.raise_for_status()

    # Dùng BeautifulSoup để đọc hidden input __RequestVerificationToken
    soup = BeautifulSoup(resp.text, "html.parser")
    token_input = soup.find("input", {"name": "__RequestVerificationToken"})

    if token_input is None:
        raise ValueError(
            "Không tìm thấy __RequestVerificationToken trên trang login. "
            "Kiểm tra lại LOGIN_URL hoặc cấu trúc HTML của trang."
        )

    xsrf_token = token_input.get("value", "")

    # --- Bước 2: POST form đăng nhập ---
    login_payload = {
        "__RequestVerificationToken": xsrf_token,
        "UserName": USERNAME,   # Tên field có thể khác tuỳ website
        "Password": PASSWORD,   # Tên field có thể khác tuỳ website
    }

    post_resp = session.post(LOGIN_URL, data=login_payload, timeout=15)
    post_resp.raise_for_status()

    # Kiểm tra đăng nhập thành công (heuristic: URL thay đổi hoặc không còn form login)
    if "login" in post_resp.url.lower() and post_resp.status_code == 200:
        # Vẫn ở trang login → có thể sai credentials
        raise PermissionError(
            "Đăng nhập thất bại. Kiểm tra ASPNET_USERNAME / ASPNET_PASSWORD."
        )

    # Session đã giữ cookie xác thực, dùng để gọi API tiếp theo
    return session


def fetch_api_data(session: requests.Session, api_url: str, params: dict = None) -> dict:
    """
    Gọi một API endpoint sau khi đã xác thực.

    Args:
        session:  requests.Session đã đăng nhập (từ create_authenticated_session)
        api_url:  URL đầy đủ của API cần gọi
        params:   Query parameters (optional)

    Returns:
        Dict JSON trả về từ API
    """
    resp = session.get(api_url, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()
