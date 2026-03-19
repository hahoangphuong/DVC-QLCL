import os
import requests
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Exception riêng cho lỗi xác thực
# ---------------------------------------------------------------------------
class RemoteAuthError(Exception):
    """Raise khi đăng nhập thất bại hoặc server từ chối xác thực."""
    pass


# ---------------------------------------------------------------------------
# Client chính
# ---------------------------------------------------------------------------
class RemoteClient:
    """
    Quản lý phiên đăng nhập tới website ASP.NET.

    Luồng sử dụng:
        client = RemoteClient()
        client.login()
        data = client.fetch_data()
    """

    def __init__(self):
        # Đọc cấu hình từ environment variables — không hardcode
        base_url = os.environ.get("BASE_URL", "").rstrip("/")
        login_path = os.environ.get("LOGIN_PATH", "").lstrip("/")
        if not base_url:
            raise EnvironmentError("BASE_URL chưa được set trong environment.")

        self.login_url = f"{base_url}/{login_path}"
        self.data_url = os.environ.get("DATA_URL", "")
        self.username = os.environ.get("REMOTE_USERNAME", "")
        self.password = os.environ.get("REMOTE_PASSWORD", "")
        self.base_url = base_url

        if not self.username or not self.password:
            raise EnvironmentError("REMOTE_USERNAME hoặc REMOTE_PASSWORD chưa được set.")

        # Session dùng xuyên suốt: giữ cookie tự động giữa các request
        self.session = requests.Session()

    # -----------------------------------------------------------------------
    # Bước 1: GET trang login — lấy cookie và HTML
    # -----------------------------------------------------------------------
    def _get_login_page(self) -> requests.Response:
        """GET trang login, lưu cookie vào session, trả về Response."""
        resp = self.session.get(
            self.login_url,
            timeout=15,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        resp.raise_for_status()
        return resp

    # -----------------------------------------------------------------------
    # Bước 2: Đọc __RequestVerificationToken từ HTML (hidden input)
    # -----------------------------------------------------------------------
    def _extract_hidden_verification_token(self, html: str) -> str | None:
        """
        Parse HTML bằng BeautifulSoup để tìm hidden input __RequestVerificationToken.
        Trả về giá trị token hoặc None nếu không tìm thấy hoặc không có value.
        """
        soup = BeautifulSoup(html, "html.parser")
        token_input = soup.find("input", {"name": "__RequestVerificationToken"})
        if token_input:
            value = token_input.get("value")
            # Trả None nếu value rỗng để tránh gửi token trống
            return value if value else None
        return None

    # -----------------------------------------------------------------------
    # Bước 3 & 4: Lấy XSRF token từ cookie, POST form login
    # -----------------------------------------------------------------------
    def login(self) -> None:
        """
        Thực hiện toàn bộ luồng đăng nhập:
          1. GET trang login → lấy cookie + HTML
          2. Tìm __RequestVerificationToken trong HTML (nếu có)
          3. Tìm XSRF-TOKEN và __RequestVerificationToken trong cookie (nếu có)
          4. POST form đăng nhập với đủ headers và payload
          5. Kiểm tra kết quả JSON hoặc redirect
        """
        # --- Bước 1: GET trang login ---
        login_page = self._get_login_page()

        # --- Bước 2: Đọc token từ HTML ---
        html_verification_token = self._extract_hidden_verification_token(login_page.text)

        # --- Bước 3: Đọc token từ cookie ---
        # ASP.NET Boilerplate / ABP thường set XSRF-TOKEN và __RequestVerificationToken trong cookie
        xsrf_token_cookie = self.session.cookies.get("XSRF-TOKEN")
        cookie_verification_token = self.session.cookies.get("__RequestVerificationToken")

        # Ưu tiên lấy từ HTML, fallback sang cookie
        verification_token = html_verification_token or cookie_verification_token

        # --- Bước 4: Chuẩn bị headers ---
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": self.base_url,
            "Referer": self.login_url,
            "X-Requested-With": "XMLHttpRequest",
        }
        # Thêm x-xsrf-token nếu tìm được từ cookie
        if xsrf_token_cookie:
            headers["x-xsrf-token"] = xsrf_token_cookie

        # --- Bước 5: Chuẩn bị payload ---
        payload = {
            # TODO: Nếu site redirect về một trang cụ thể sau login, điền hash vào đây
            "returnUrlHash": "",
            # TODO: Nếu site dùng multi-tenant (ABP), điền tên tenant vào SECRET ASPNET_TENANT
            #       rồi đổi dòng dưới thành: os.environ.get("ASPNET_TENANT", "")
            "tenancyName": "",
            # TODO: Kiểm tra tên field thực tế trong form HTML của trang login.
            #       ABP dùng "usernameOrEmailAddress", site khác có thể dùng "UserName" hoặc "Email"
            "usernameOrEmailAddress": self.username,
            "password": self.password,
            # TODO: Nếu site bật 2FA, cần lấy code động và điền vào đây
            "code": "",
            # TODO: Nếu site bắt captcha, không thể tự động hoá trừ khi dùng captcha solver.
            #       Để trống nếu site không bắt captcha ở lần đầu login.
            "captchaText": "",
        }
        if verification_token:
            payload["__RequestVerificationToken"] = verification_token

        # --- Bước 6: POST đăng nhập ---
        resp = self.session.post(
            self.login_url,
            data=payload,
            headers=headers,
            timeout=15,
            allow_redirects=True,
        )
        resp.raise_for_status()

        # --- Bước 7: Kiểm tra kết quả ---
        # Nhiều ASP.NET app trả JSON: {"success": true/false, "unAuthorizedRequest": ...}
        try:
            result = resp.json()

            # FIX: kiểm tra result là dict trước khi gọi .get()
            # Nếu API trả JSON array hoặc giá trị khác thì bỏ qua kiểm tra này
            if isinstance(result, dict):
                if result.get("unAuthorizedRequest") is True:
                    raise RemoteAuthError(
                        "Server trả về unAuthorizedRequest=true. Kiểm tra credentials."
                    )
                if result.get("success") is False:
                    msg = result.get("error", {}).get("message", "Đăng nhập thất bại.")
                    raise RemoteAuthError(f"Đăng nhập thất bại: {msg}")

        except ValueError:
            # Response không phải JSON → có thể là redirect HTML bình thường
            # Kiểm tra heuristic: nếu vẫn ở URL login thì coi là thất bại
            if "login" in resp.url.lower():
                raise RemoteAuthError(
                    "Đăng nhập thất bại (vẫn ở trang login). "
                    "Kiểm tra REMOTE_USERNAME / REMOTE_PASSWORD."
                )

    # -----------------------------------------------------------------------
    # Bước 5: Gọi API dữ liệu dùng session đã đăng nhập
    # -----------------------------------------------------------------------
    def fetch_data(self, url: str | None = None, params: dict | None = None) -> requests.Response:
        """
        Gọi DATA_URL (hoặc url tuỳ chỉnh) bằng session đã xác thực.
        Tự động đính kèm x-xsrf-token nếu cookie còn tồn tại.

        Args:
            url:    URL cần gọi. Nếu None sẽ dùng DATA_URL từ env.
                    TODO: Điền DATA_URL trong Secrets = URL API thực tế của site.
            params: Query parameters (optional).

        Returns:
            requests.Response — caller tự parse JSON hay text tuỳ ý.
        """
        target_url = url or self.data_url
        if not target_url:
            raise ValueError(
                "Cần truyền url hoặc set DATA_URL trong environment. "
                "Ví dụ: https://your-site.com/api/services/app/Order/GetAll"
            )

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": self.base_url,
        }

        # Gửi lại x-xsrf-token nếu cookie vẫn còn (bắt buộc với nhiều ASP.NET API)
        xsrf = self.session.cookies.get("XSRF-TOKEN")
        if xsrf:
            headers["x-xsrf-token"] = xsrf

        resp = self.session.get(target_url, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        return resp

    # -----------------------------------------------------------------------
    # Debug helper
    # -----------------------------------------------------------------------
    def debug_cookies(self) -> dict:
        """
        Trả về dict tên cookie → giá trị để debug.
        Dùng khi cần kiểm tra session đã nhận đủ cookie chưa.
        """
        return {name: value for name, value in self.session.cookies.items()}
