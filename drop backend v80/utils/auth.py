"""
Authentication utilities
"""

from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer
from jose import JWTError, jwt

security = HTTPBearer()
SECRET_KEY = "your-secret-key-change-this-in-production"
ALGORITHM = "HS256"


def verify_token(credentials=Depends(security)):
    """Verify JWT token"""
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

